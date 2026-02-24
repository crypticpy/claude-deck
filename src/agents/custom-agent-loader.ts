/**
 * Custom Agent Loader - Loads user-defined agents from config file
 *
 * This module allows users to define custom AI coding agents via a JSON config file
 * at ~/.claude-deck/custom-agents.json. Custom agents can specify their own
 * keybindings, capabilities, and process detection patterns.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  BaseAgentAdapter,
  type AgentCapabilities,
  type AgentState,
  type AgentColor,
  type SpawnOptions,
  type TerminalType,
} from "./base-agent.js";
import {
  quotePosixShellArg,
  sendKeystroke as terminalSendKeystroke,
  sendText as terminalSendText,
  focusTerminal as terminalFocus,
  isTerminalFocused as terminalIsFocused,
  openInTerminal as terminalOpen,
  KEY_CODES,
} from "./terminal-utils.js";

const execFileAsync = promisify(execFile);

/**
 * Keybinding definition for custom agent actions
 */
export interface CustomKeybinding {
  /** Key to press (e.g., "y", "n", "c", "return", "tab") */
  key: string;
  /** Modifier keys (e.g., ["control"], ["shift", "command"]) */
  modifiers?: string[];
}

/**
 * Custom agent definition from config file
 */
export interface CustomAgentConfig {
  /** Unique identifier for this agent (e.g., "cursor", "windsurf") */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Primary brand color (hex, e.g., "#00D4FF") */
  color: string;
  /** CLI command to run this agent */
  command: string;
  /** Process names to detect running instances */
  processNames: string[];
  /** What this agent supports */
  capabilities: {
    approve?: boolean;
    reject?: boolean;
    interrupt?: boolean;
    modelSwitch?: boolean;
    modeSwitch?: boolean;
    yoloMode?: boolean;
    planMode?: boolean;
    thinkingToggle?: boolean;
    slashCommands?: string[];
  };
  /** Keybindings for each action */
  keybindings?: {
    approve?: CustomKeybinding;
    reject?: CustomKeybinding;
    interrupt?: CustomKeybinding;
    cycleMode?: CustomKeybinding;
    cycleModel?: CustomKeybinding;
    toggleThinking?: CustomKeybinding;
  };
  /** Optional command arguments for spawning a new session */
  spawnArgs?: string[];
  /** Patterns to match in window title for detection */
  titlePatterns?: string[];
}

/**
 * Root config file format
 */
export interface CustomAgentsConfigFile {
  agents: CustomAgentConfig[];
}

/**
 * Custom Agent Adapter - Dynamically created from config
 *
 * This adapter implements BaseAgentAdapter for user-defined agents.
 * It uses the configuration to determine behavior for all operations.
 */
export class CustomAgentAdapter extends BaseAgentAdapter {
  readonly id: string;
  readonly name: string;
  readonly color: AgentColor;
  readonly capabilities: AgentCapabilities;
  readonly command: string;
  readonly processNames: string[];

  private config: CustomAgentConfig;
  private configDir: string;
  private currentState: AgentState;
  private terminalType: TerminalType = "kitty";

  private statePoller?: ReturnType<typeof setInterval>;
  private stateDebounceTimer?: ReturnType<typeof setTimeout>;
  private lastEmittedUpdatedAt = 0;

  constructor(config: CustomAgentConfig) {
    super();
    this.config = config;
    this.id = config.id;
    this.name = config.name;
    this.command = config.command;
    this.processNames = config.processNames;

    // Parse color - support both hex string and full AgentColor object
    const primaryColor = config.color;
    this.color = {
      primary: primaryColor,
      muted: this.darkenColor(primaryColor),
    };

    // Build capabilities from config
    this.capabilities = {
      approve: config.capabilities.approve ?? false,
      reject: config.capabilities.reject ?? false,
      interrupt: config.capabilities.interrupt ?? true,
      modelSwitch: config.capabilities.modelSwitch ?? false,
      modeSwitch: config.capabilities.modeSwitch ?? false,
      yoloMode: config.capabilities.yoloMode ?? false,
      planMode: config.capabilities.planMode ?? false,
      thinkingToggle: config.capabilities.thinkingToggle ?? false,
      slashCommands: config.capabilities.slashCommands ?? [],
      stateFile: false, // Custom agents don't use state files by default
    };

    this.configDir = join(homedir(), ".claude-deck");
    this.currentState = this.getDefaultState();
  }

  // ============================================
  // Lifecycle Methods
  // ============================================

  async isInstalled(): Promise<boolean> {
    try {
      await execFileAsync("which", [this.command]);
      return true;
    } catch {
      return false;
    }
  }

  async isRunning(): Promise<boolean> {
    for (const processName of this.processNames) {
      try {
        const { stdout } = await execFileAsync("pgrep", ["-f", processName]);
        if (stdout.trim().length > 0) {
          return true;
        }
      } catch {
        // Process not found
      }
    }
    return false;
  }

  async detectSession(): Promise<AgentState | null> {
    const running = await this.isRunning();
    if (!running) return null;

    await this.refreshState();
    return this.currentState;
  }

  async initialize(): Promise<void> {
    // Ensure config directory exists
    if (!existsSync(this.configDir)) {
      await mkdir(this.configDir, { recursive: true });
    }

    // Load terminal type from claude-deck config
    await this.loadTerminalConfig();

    // Initial state refresh
    await this.refreshState();
  }

  dispose(): void {
    this.stopWatching();
  }

  // ============================================
  // Session Control
  // ============================================

  async spawnSession(options?: SpawnOptions): Promise<void> {
    const args: string[] = [...(this.config.spawnArgs ?? [])];

    if (options?.model && this.capabilities.modelSwitch) {
      args.push("--model", options.model);
    }

    const commandParts = [this.command, ...args];
    const command = commandParts.map(quotePosixShellArg).join(" ");
    await this.openInTerminal(command, options?.cwd);
  }

  async continueSession(options?: { cwd?: string }): Promise<void> {
    // Most custom agents don't have a continue concept - just start new
    await this.spawnSession({ cwd: options?.cwd });
  }

  // ============================================
  // Input Control
  // ============================================

  async approve(): Promise<boolean> {
    if (!this.capabilities.approve) return false;

    const keybinding = this.config.keybindings?.approve ?? { key: "y" };
    return this.sendKeystroke(keybinding.key, keybinding.modifiers);
  }

  async reject(): Promise<boolean> {
    if (!this.capabilities.reject) return false;

    const keybinding = this.config.keybindings?.reject ?? { key: "n" };
    return this.sendKeystroke(keybinding.key, keybinding.modifiers);
  }

  async interrupt(): Promise<boolean> {
    if (!this.capabilities.interrupt) return false;

    const keybinding = this.config.keybindings?.interrupt ?? {
      key: "c",
      modifiers: ["control"],
    };
    return this.sendKeystroke(keybinding.key, keybinding.modifiers);
  }

  async sendKeystroke(key: string, modifiers: string[] = []): Promise<boolean> {
    return terminalSendKeystroke(this.terminalType, key, modifiers);
  }

  async sendCommand(command: string): Promise<boolean> {
    return this.sendText(command);
  }

  async sendText(text: string): Promise<boolean> {
    return terminalSendText(this.terminalType, text);
  }

  // ============================================
  // Mode/Model Control
  // ============================================

  async cycleMode(): Promise<boolean> {
    if (!this.capabilities.modeSwitch) return false;

    const keybinding = this.config.keybindings?.cycleMode;
    if (!keybinding) return false;

    return this.sendKeystroke(keybinding.key, keybinding.modifiers);
  }

  async cycleModel(): Promise<boolean> {
    if (!this.capabilities.modelSwitch) return false;

    const keybinding = this.config.keybindings?.cycleModel;
    if (!keybinding) return false;

    return this.sendKeystroke(keybinding.key, keybinding.modifiers);
  }

  async toggleThinking(): Promise<boolean> {
    if (!this.capabilities.thinkingToggle) return false;

    const keybinding = this.config.keybindings?.toggleThinking;
    if (!keybinding) return false;

    return this.sendKeystroke(keybinding.key, keybinding.modifiers);
  }

  // ============================================
  // State Management
  // ============================================

  getState(): AgentState {
    return this.currentState;
  }

  async refreshState(): Promise<AgentState> {
    const isRunning = await this.isRunning();

    if (!isRunning) {
      this.currentState = this.getDefaultState();
      return this.currentState;
    }

    // Custom agents have limited state - we can only detect if they're running
    this.currentState = {
      id: this.id,
      name: this.name,
      active: false,
      status: "working",
      hasPermissionPending: false,
      lastUpdated: new Date().toISOString(),
    };

    return this.currentState;
  }

  startWatching(): void {
    const scheduleRefresh = (): void => {
      if (this.stateDebounceTimer) clearTimeout(this.stateDebounceTimer);
      this.stateDebounceTimer = setTimeout(() => {
        void this.refreshState()
          .then((state) => {
            const updatedAt = Number.isFinite(Date.parse(state.lastUpdated))
              ? Date.parse(state.lastUpdated)
              : Date.now();
            if (updatedAt <= this.lastEmittedUpdatedAt) return;
            this.lastEmittedUpdatedAt = updatedAt;
            this.emit("stateChange", state);
          })
          .catch(() => {
            // ignore
          });
      }, 100);
    };

    // Poller for custom agents (no state file to watch)
    if (!this.statePoller) {
      this.statePoller = setInterval(scheduleRefresh, 2000);
    }
  }

  stopWatching(): void {
    if (this.statePoller) {
      clearInterval(this.statePoller);
      this.statePoller = undefined;
    }
    if (this.stateDebounceTimer) {
      clearTimeout(this.stateDebounceTimer);
      this.stateDebounceTimer = undefined;
    }
  }

  // ============================================
  // Terminal Control
  // ============================================

  async focusTerminal(): Promise<void> {
    await terminalFocus(this.terminalType);
  }

  async isTerminalFocused(): Promise<boolean> {
    return terminalIsFocused(this.terminalType);
  }

  // ============================================
  // Custom Agent-Specific Methods
  // ============================================

  /**
   * Set the terminal type for this adapter
   */
  setTerminalType(type: TerminalType): void {
    this.terminalType = type;
  }

  /**
   * Get the current terminal type
   */
  getTerminalType(): TerminalType {
    return this.terminalType;
  }

  /**
   * Get the original config for this agent
   */
  getConfig(): CustomAgentConfig {
    return this.config;
  }

  /**
   * Get title patterns for terminal detection
   */
  getTitlePatterns(): RegExp[] {
    if (this.config.titlePatterns && this.config.titlePatterns.length > 0) {
      return this.config.titlePatterns
        .map((p) => {
          try {
            return new RegExp(p, "i");
          } catch {
            return null;
          }
        })
        .filter((r): r is RegExp => r !== null);
    }
    // Default to matching the agent name or id
    return [new RegExp(this.name, "i"), new RegExp(this.id, "i")];
  }

  // ============================================
  // Private Helpers
  // ============================================

  private async loadTerminalConfig(): Promise<void> {
    try {
      const configPath = join(this.configDir, "config.json");
      if (existsSync(configPath)) {
        const content = await readFile(configPath, "utf-8");
        const config = JSON.parse(content);
        if (config.terminal?.type) {
          this.terminalType = config.terminal.type;
        }
      }
    } catch {
      // Use defaults
    }
  }

  private async openInTerminal(command: string, cwd?: string): Promise<void> {
    const cwdToUse = cwd ?? homedir();
    await terminalOpen(this.terminalType, command, cwdToUse);
  }

  /**
   * Darken a hex color to create muted version
   */
  private darkenColor(hex: string): string {
    // Remove # if present
    const cleanHex = hex.replace("#", "");

    // Parse RGB values
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);

    // Darken by 50%
    const darkenedR = Math.floor(r * 0.5);
    const darkenedG = Math.floor(g * 0.5);
    const darkenedB = Math.floor(b * 0.5);

    // Convert back to hex
    return `#${darkenedR.toString(16).padStart(2, "0")}${darkenedG.toString(16).padStart(2, "0")}${darkenedB.toString(16).padStart(2, "0")}`;
  }
}

/**
 * Load custom agents from configuration file
 *
 * Reads ~/.claude-deck/custom-agents.json and creates CustomAgentAdapter
 * instances for each defined agent.
 *
 * @returns Array of custom agent adapters, empty if no config or errors
 */
export async function loadCustomAgents(): Promise<CustomAgentAdapter[]> {
  const configPath = join(homedir(), ".claude-deck", "custom-agents.json");

  if (!existsSync(configPath)) {
    return [];
  }

  try {
    const content = await readFile(configPath, "utf-8");
    const config: CustomAgentsConfigFile = JSON.parse(content);

    if (!config.agents || !Array.isArray(config.agents)) {
      console.warn("custom-agents.json: 'agents' array is missing or invalid");
      return [];
    }

    const agents: CustomAgentAdapter[] = [];

    for (const agentConfig of config.agents) {
      // Validate required fields
      if (!agentConfig.id || typeof agentConfig.id !== "string") {
        console.warn("custom-agents.json: agent missing 'id' field, skipping");
        continue;
      }
      if (!agentConfig.name || typeof agentConfig.name !== "string") {
        console.warn(
          `custom-agents.json: agent '${agentConfig.id}' missing 'name' field, skipping`,
        );
        continue;
      }
      if (!agentConfig.color || typeof agentConfig.color !== "string") {
        console.warn(
          `custom-agents.json: agent '${agentConfig.id}' missing 'color' field, skipping`,
        );
        continue;
      }
      if (!agentConfig.command || typeof agentConfig.command !== "string") {
        console.warn(
          `custom-agents.json: agent '${agentConfig.id}' missing 'command' field, skipping`,
        );
        continue;
      }
      if (
        !agentConfig.processNames ||
        !Array.isArray(agentConfig.processNames)
      ) {
        console.warn(
          `custom-agents.json: agent '${agentConfig.id}' missing 'processNames' field, skipping`,
        );
        continue;
      }
      if (
        !agentConfig.capabilities ||
        typeof agentConfig.capabilities !== "object"
      ) {
        console.warn(
          `custom-agents.json: agent '${agentConfig.id}' missing 'capabilities' field, skipping`,
        );
        continue;
      }

      // Validate keybinding keys if present
      if (agentConfig.keybindings) {
        const invalidKeys: string[] = [];
        for (const [action, keybinding] of Object.entries(
          agentConfig.keybindings,
        )) {
          if (
            keybinding &&
            typeof keybinding === "object" &&
            "key" in keybinding
          ) {
            const key = (keybinding as CustomKeybinding).key.toLowerCase();
            if (!(key in KEY_CODES)) {
              invalidKeys.push(`${action}.key='${key}'`);
            }
          }
        }
        if (invalidKeys.length > 0) {
          console.warn(
            `custom-agents.json: agent '${agentConfig.id}' has invalid keybindings: ${invalidKeys.join(", ")}. ` +
              `Valid keys: ${Object.keys(KEY_CODES).join(", ")}`,
          );
        }
      }

      try {
        const adapter = new CustomAgentAdapter(agentConfig);
        agents.push(adapter);
        console.log(
          `Loaded custom agent: ${agentConfig.id} (${agentConfig.name})`,
        );
      } catch (error) {
        console.error(
          `Failed to create adapter for agent '${agentConfig.id}':`,
          error,
        );
      }
    }

    return agents;
  } catch (error) {
    console.error("Failed to load custom-agents.json:", error);
    return [];
  }
}

/**
 * Get agent detection patterns for terminal detector
 *
 * Returns patterns that can be used to detect custom agents in terminal windows.
 */
export function getCustomAgentPatterns(
  agents: CustomAgentAdapter[],
): Array<{ id: string; processNames: string[]; titlePatterns: RegExp[] }> {
  return agents.map((agent) => ({
    id: agent.id,
    processNames: agent.processNames,
    titlePatterns: agent.getTitlePatterns(),
  }));
}
