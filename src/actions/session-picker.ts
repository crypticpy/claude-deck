import streamDeck, {
  SingletonAction,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type SendToPluginEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { homedir } from "node:os";
import { join } from "node:path";
import { stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stateAggregator } from "../agents/index.js";
import type { JsonObject, JsonValue } from "@elgato/utils";

const execFileAsync = promisify(execFile);

type SessionPickerSettings = JsonObject & {
  projectPath?: string;
  label?: string;
};

type SessionPickerPiMessage = { type: "refresh" };

type ProjectChoice = {
  projectName: string;
  projectPath: string;
  lastTranscriptPath?: string;
  lastTranscriptMtimeMs?: number;
};

export class SessionPickerAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.session-picker";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private settingsById = new Map<string, SessionPickerSettings>();

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    this.settingsById.set(
      ev.action.id,
      (ev.payload.settings as SessionPickerSettings) ?? {},
    );
    await this.updateDisplay(ev.action);
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    this.settingsById.delete(ev.action.id);
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent,
  ): Promise<void> {
    this.settingsById.set(
      ev.action.id,
      (ev.payload.settings as SessionPickerSettings) ?? {},
    );
    await this.updateDisplay(ev.action);
  }

  override async onPropertyInspectorDidAppear(): Promise<void> {
    await this.sendPiProjects();
  }

  override async onSendToPlugin(
    ev: SendToPluginEvent<SessionPickerPiMessage, SessionPickerSettings>,
  ): Promise<void> {
    const payload = ev.payload as SessionPickerPiMessage;
    if (payload?.type === "refresh") {
      await this.sendPiProjects();
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const settings = this.getSettings(ev.action.id);
    const projectPath = settings.projectPath;

    if (!projectPath) {
      await ev.action.showAlert();
      return;
    }

    try {
      await ev.action.setTitle("...");
      await stateAggregator.continueSession("claude", { cwd: projectPath });
      await ev.action.showOk();
    } catch (error) {
      streamDeck.logger.error("SessionPickerAction continue failed:", error);
      await ev.action.showAlert();
    } finally {
      await this.updateDisplay(ev.action);
    }
  }

  private getSettings(actionId: string): SessionPickerSettings {
    return this.settingsById.get(actionId) ?? {};
  }

  private async sendPiProjects(): Promise<void> {
    const projects = await this.listRecentProjects(30);
    await streamDeck.ui.sendToPropertyInspector({
      projects,
    } as unknown as JsonValue);
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
  ): Promise<void> {
    const settings = this.getSettings(action.id);
    const label = (settings.label || "Session").toUpperCase();
    const projectName = settings.projectPath
      ? this.projectNameFromPath(settings.projectPath)
      : "None";
    const color = settings.projectPath ? "#22c55e" : "#64748b";

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>
        <text x="72" y="26" font-family="system-ui, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">${label}</text>
        <rect x="18" y="38" width="108" height="52" rx="10" fill="${color}" opacity="0.16"/>
        <rect x="18" y="38" width="108" height="52" rx="10" fill="none" stroke="${color}" stroke-width="3"/>
        <text x="72" y="66" font-family="system-ui, sans-serif" font-size="16" fill="${color}" text-anchor="middle" font-weight="bold">${this.truncate(projectName, 12)}</text>
        <text x="72" y="86" font-family="system-ui, sans-serif" font-size="10" fill="#94a3b8" text-anchor="middle">Tap: continue</text>
        <text x="72" y="118" font-family="system-ui, sans-serif" font-size="11" fill="${color}" text-anchor="middle" font-weight="bold">PROJECT</text>
      </svg>
    `;

    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private truncate(str: string, max: number): string {
    return str.length <= max ? str : `${str.slice(0, max - 1)}…`;
  }

  private projectNameFromPath(projectPath: string): string {
    const parts = projectPath.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? projectPath;
  }

  private async listRecentProjects(limit: number): Promise<ProjectChoice[]> {
    const projectsDir = join(homedir(), ".claude", "projects");

    let stdout = "";
    try {
      const res = await execFileAsync("find", [
        projectsDir,
        "-name",
        "*.jsonl",
        "-print",
      ]);
      stdout = res.stdout ?? "";
    } catch {
      return [];
    }

    const filePaths = stdout.split("\n").filter(Boolean);
    const byProject = new Map<string, ProjectChoice>();

    for (const filePath of filePaths) {
      const rel = filePath.startsWith(projectsDir)
        ? filePath.slice(projectsDir.length)
        : filePath;
      const relParts = rel.split("/").filter(Boolean);
      const projectName = relParts[0];
      if (!projectName) continue;

      const projectPath = join(projectsDir, projectName);
      let mtimeMs = 0;
      try {
        const s = await stat(filePath);
        mtimeMs = s.mtimeMs;
      } catch {
        continue;
      }

      const existing = byProject.get(projectPath);
      if (!existing || (existing.lastTranscriptMtimeMs ?? 0) < mtimeMs) {
        byProject.set(projectPath, {
          projectName,
          projectPath,
          lastTranscriptPath: filePath,
          lastTranscriptMtimeMs: mtimeMs,
        });
      }
    }

    return [...byProject.values()]
      .sort(
        (a, b) =>
          (b.lastTranscriptMtimeMs ?? 0) - (a.lastTranscriptMtimeMs ?? 0),
      )
      .slice(0, limit);
  }
}
