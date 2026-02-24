/**
 * Settings Action - Global configuration for Claude Deck
 *
 * This action provides access to plugin-wide settings including:
 * - Terminal type selection
 * - Agent enable/disable toggles
 * - Layout mode preferences
 */

import {
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
  type SendToPluginEvent,
} from "@elgato/streamdeck";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { stateAggregator, AGENT_COLORS } from "../agents/index.js";
import { svgToDataUri } from "../utils/svg-utils.js";

type SettingsPiMessage = JsonValue & {
  type: string;
  config?: Partial<PluginConfig>;
};
type SettingsPayload = JsonObject;

/**
 * Plugin configuration structure
 */
interface PluginConfig {
  terminal: {
    type: string;
  };
  layout: {
    mode: "primary" | "dashboard" | "pages";
    primaryAgent: string;
  };
  agents: {
    [key: string]: {
      enabled: boolean;
      color?: string;
      defaultModel?: string;
    };
  };
  autoSwitchOnFocus: boolean;
  showInactiveAgents: boolean;
}

const CONFIG_DIR = join(homedir(), ".claude-deck");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: PluginConfig = {
  terminal: { type: "kitty" },
  layout: { mode: "primary", primaryAgent: "claude" },
  agents: {
    claude: { enabled: true },
    aider: { enabled: true },
    codex: { enabled: true },
    gemini: { enabled: true },
    opencode: { enabled: false },
  },
  autoSwitchOnFocus: true,
  showInactiveAgents: true,
};

export class SettingsAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.settings";

  private activeActions = new Map<string, WillAppearEvent["action"]>();

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    await this.updateDisplay(ev.action);
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    // Show current config summary
    await ev.action.showOk();
  }

  override async onSendToPlugin(
    ev: SendToPluginEvent<SettingsPiMessage, SettingsPayload>,
  ): Promise<void> {
    const payload = ev.payload;

    if (payload.type === "getConfig") {
      const config = await this.loadConfig();
      const agentInfo = this.getAgentInfo();
      await (
        ev.action as unknown as {
          sendToPropertyInspector(data: unknown): Promise<void>;
        }
      ).sendToPropertyInspector({ config, agentInfo });
    } else if (payload.type === "saveConfig" && payload.config) {
      await this.saveConfig(payload.config);
      await (ev.action as unknown as { showOk(): Promise<void> }).showOk();
      await this.updateDisplay(ev.action);
    }
  }

  private async loadConfig(): Promise<PluginConfig> {
    try {
      if (existsSync(CONFIG_PATH)) {
        const content = await readFile(CONFIG_PATH, "utf-8");
        const saved = JSON.parse(content);
        return { ...DEFAULT_CONFIG, ...saved };
      }
    } catch {
      // Return defaults
    }
    return DEFAULT_CONFIG;
  }

  private async saveConfig(updates: Partial<PluginConfig>): Promise<void> {
    const current = await this.loadConfig();
    const merged = { ...current, ...updates };

    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(merged, null, 2));

    // Apply terminal type change
    if (updates.terminal?.type) {
      const claudeAgent = stateAggregator.getAgent("claude");
      if (claudeAgent && "setTerminalType" in claudeAgent) {
        (
          claudeAgent as { setTerminalType: (t: string) => void }
        ).setTerminalType(updates.terminal.type);
      }
    }

    // Apply auto-switch setting
    if (updates.autoSwitchOnFocus !== undefined) {
      stateAggregator.setAutoSwitchOnFocus(updates.autoSwitchOnFocus);
    }
  }

  private getAgentInfo(): {
    id: string;
    name: string;
    color: string;
    installed: boolean;
  }[] {
    const agents = stateAggregator.getAgents();
    return agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      color: AGENT_COLORS[agent.id]?.primary ?? "#888888",
      installed: true, // We'd need async to check properly
    }));
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
  ): Promise<void> {
    const config = await this.loadConfig();
    const enabledCount = Object.values(config.agents).filter(
      (a) => a.enabled,
    ).length;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
      <rect width="144" height="144" fill="#0f172a" rx="12"/>
      <circle cx="72" cy="55" r="30" fill="#475569" opacity="0.3"/>
      <!-- Gear icon -->
      <path d="M72 40 L74 35 L82 35 L84 40 L89 43 L94 40 L98 46 L95 51 L96 58 L102 60 L102 68 L96 70 L95 77 L98 82 L94 88 L89 85 L84 88 L82 93 L74 93 L72 88 L67 85 L62 88 L58 82 L61 77 L60 70 L54 68 L54 60 L60 58 L61 51 L58 46 L62 40 L67 43 L72 40 Z"
            fill="#64748b" stroke="#94a3b8" stroke-width="1"/>
      <circle cx="72" cy="62" r="10" fill="#0f172a"/>
      <text x="72" y="105" font-family="system-ui" font-size="12" fill="#94a3b8" text-anchor="middle">Settings</text>
      <text x="72" y="120" font-family="system-ui" font-size="10" fill="#64748b" text-anchor="middle">${enabledCount} agents</text>
    </svg>`;

    await action.setImage(svgToDataUri(svg));
    await action.setTitle("");
  }
}
