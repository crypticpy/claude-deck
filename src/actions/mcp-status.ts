import streamDeck, {
  SingletonAction,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type KeyUpEvent,
  type PropertyInspectorDidAppearEvent,
  type SendToPluginEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { claudeAgent } from "../agents/index.js";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { escapeXml } from "../utils/svg-utils.js";

const execFileAsync = promisify(execFile);

type McpStatusSettings = JsonObject & {
  label?: string;
  onPressCommand?: string;
  onLongPressCommand?: string;
  longPressMs?: number;
};

type McpStatusPiMessage = { type: "refresh" };

type McpServerConfig = {
  type?: string;
  command?: string;
  args?: unknown;
};

export class McpStatusAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.mcp-status";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private settingsById = new Map<string, McpStatusSettings>();
  private pressStartedAt = new Map<string, number>();

  private cachedAt = 0;
  private cachedServers: {
    names: string[];
    servers: Record<string, McpServerConfig>;
  } = { names: [], servers: {} };

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    this.settingsById.set(
      ev.action.id,
      (ev.payload.settings as McpStatusSettings) ?? {},
    );
    await this.updateDisplay(ev.action);
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    this.settingsById.delete(ev.action.id);
    this.pressStartedAt.delete(ev.action.id);
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent,
  ): Promise<void> {
    this.settingsById.set(
      ev.action.id,
      (ev.payload.settings as McpStatusSettings) ?? {},
    );
    await this.updateDisplay(ev.action);
  }

  override async onPropertyInspectorDidAppear(
    ev: PropertyInspectorDidAppearEvent,
  ): Promise<void> {
    await this.sendPiState(ev.action.id);
  }

  override async onSendToPlugin(
    ev: SendToPluginEvent<McpStatusPiMessage, McpStatusSettings>,
  ): Promise<void> {
    const payload = ev.payload as McpStatusPiMessage;
    if (payload?.type === "refresh") {
      await this.sendPiState(ev.action.id);
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    this.pressStartedAt.set(ev.action.id, Date.now());
  }

  override async onKeyUp(ev: KeyUpEvent): Promise<void> {
    const startedAt = this.pressStartedAt.get(ev.action.id) ?? Date.now();
    const heldMs = Date.now() - startedAt;
    this.pressStartedAt.delete(ev.action.id);

    const settings = this.getSettings(ev.action.id);
    const longPressMs = settings.longPressMs ?? 650;

    const longPress = heldMs >= longPressMs;
    const command = longPress
      ? settings.onLongPressCommand?.trim()
      : settings.onPressCommand?.trim();

    try {
      if (command) {
        const ok = await claudeAgent.sendText(command);
        if (ok) await ev.action.showOk();
        else await ev.action.showAlert();
      } else {
        // Default: open Claude settings file.
        const settingsPath = this.getClaudeSettingsPath();
        await execFileAsync("open", [settingsPath]);
        await ev.action.showOk();
      }
    } catch (error) {
      streamDeck.logger.error("McpStatusAction action failed:", error);
      await ev.action.showAlert();
    } finally {
      await this.updateDisplay(ev.action);
    }
  }

  private getSettings(actionId: string): McpStatusSettings {
    const stored = this.settingsById.get(actionId) ?? {};
    return {
      label: stored.label ?? "MCP",
      onPressCommand: stored.onPressCommand ?? "",
      onLongPressCommand: stored.onLongPressCommand ?? "",
      longPressMs: stored.longPressMs ?? 650,
    };
  }

  private getClaudeSettingsPath(): string {
    return join(homedir(), ".claude", "settings.json");
  }

  private async readMcpServers(): Promise<{
    names: string[];
    servers: Record<string, McpServerConfig>;
  }> {
    const now = Date.now();
    if (now - this.cachedAt < 2000) return this.cachedServers;

    const settingsPath = this.getClaudeSettingsPath();
    try {
      const content = await readFile(settingsPath, "utf-8");
      const json = JSON.parse(content) as Record<string, unknown>;
      const mcpServers = (json.mcpServers ?? json.mcp_servers) as
        | Record<string, McpServerConfig>
        | undefined;
      const servers =
        mcpServers && typeof mcpServers === "object" ? mcpServers : {};
      const names = Object.keys(servers).sort();
      this.cachedAt = now;
      this.cachedServers = { names, servers };
      return this.cachedServers;
    } catch {
      this.cachedAt = now;
      this.cachedServers = { names: [], servers: {} };
      return this.cachedServers;
    }
  }

  private async sendPiState(actionId: string): Promise<void> {
    const settings = this.getSettings(actionId);
    const mcp = await this.readMcpServers();
    await streamDeck.ui.sendToPropertyInspector({
      settings,
      mcp,
    } as unknown as JsonValue);
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
  ): Promise<void> {
    const settings = this.getSettings(action.id);
    const { names } = await this.readMcpServers();
    const count = names.length;

    const color = count > 0 ? "#a855f7" : "#64748b";
    const title = (settings.label ?? "MCP").toUpperCase();
    const line1 = count > 0 ? (names[0] ?? "") : "No servers";
    const line2 =
      count > 1 ? (names[1] ?? "") : count > 0 ? `${count} configured` : "";

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>
        <text x="72" y="22" font-family="system-ui, sans-serif" font-size="10" fill="#64748b" text-anchor="middle">${escapeXml(title)}</text>
        <rect x="16" y="30" width="112" height="58" rx="10" fill="${color}" opacity="0.16"/>
        <rect x="16" y="30" width="112" height="58" rx="10" fill="none" stroke="${color}" stroke-width="3"/>
        <text x="72" y="56" font-family="system-ui, sans-serif" font-size="14" fill="${color}" text-anchor="middle" font-weight="bold">${count}</text>
        <text x="72" y="74" font-family="monospace" font-size="10" fill="#94a3b8" text-anchor="middle">${escapeXml(this.truncate(line1, 18))}</text>
        <text x="72" y="90" font-family="monospace" font-size="10" fill="#94a3b8" text-anchor="middle">${escapeXml(this.truncate(line2, 18))}</text>
        <text x="72" y="124" font-family="system-ui, sans-serif" font-size="9" fill="#64748b" text-anchor="middle">Tap: open settings</text>
      </svg>
    `;

    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private truncate(str: string, max: number): string {
    if (!str) return "";
    return str.length <= max ? str : `${str.slice(0, max - 1)}…`;
  }
}
