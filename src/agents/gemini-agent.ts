/**
 * Gemini CLI Agent Adapter
 *
 * Implements the BaseAgentAdapter for Google Gemini CLI.
 * Gemini CLI is Google's terminal-based AI coding assistant.
 *
 * Key characteristics:
 * - Uses ~/.gemini/ for configuration
 * - Supports --yolo flag for auto-approve mode
 * - Has MCP support for tool integration
 * - Uses tool calls instead of slash commands
 *
 * @see https://github.com/google-gemini/gemini-cli
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  BaseAgentAdapter,
  type AgentCapabilities,
  type AgentState,
  type AgentColor,
  type SpawnOptions,
  type TerminalType,
  AGENT_COLORS,
} from "./base-agent.js";
import {
  quotePosixShellArg,
  sendKeystroke as terminalSendKeystroke,
  sendText as terminalSendText,
  focusTerminal as terminalFocus,
  isTerminalFocused as terminalIsFocused,
  openInTerminal as terminalOpen,
} from "./terminal-utils.js";

const execFileAsync = promisify(execFile);

/**
 * Gemini CLI configuration options
 */
interface GeminiConfig {
  /** Default model to use */
  model?: string;
  /** Auto-approve mode (--yolo) */
  yoloMode?: boolean;
}

/**
 * Gemini CLI Agent Adapter
 */
export class GeminiAgentAdapter extends BaseAgentAdapter {
  readonly id = "gemini";
  readonly name = "Gemini CLI";
  readonly color: AgentColor = AGENT_COLORS.gemini;
  readonly command = "gemini";
  readonly processNames = ["gemini"];

  readonly capabilities: AgentCapabilities = {
    approve: true,
    reject: true,
    interrupt: true,
    modelSwitch: true,
    modeSwitch: false,
    yoloMode: true,
    planMode: false,
    thinkingToggle: false,
    slashCommands: ["/help"], // Gemini uses tool calls, limited slash commands
    stateFile: true,
  };

  private configDir: string;
  private geminiConfigDir: string;
  private currentState: AgentState;
  private terminalType: TerminalType = "kitty";
  private config: GeminiConfig = {};

  private configWatcher?: FSWatcher;
  private statePoller?: ReturnType<typeof setInterval>;
  private stateDebounceTimer?: ReturnType<typeof setTimeout>;
  private lastEmittedUpdatedAt = 0;

  constructor() {
    super();
    this.configDir = join(homedir(), ".claude-deck");
    this.geminiConfigDir = join(homedir(), ".gemini");
    this.currentState = this.getDefaultState();
  }

  // ============================================
  // Lifecycle Methods
  // ============================================

  async isInstalled(): Promise<boolean> {
    try {
      await execFileAsync("which", ["gemini"]);
      return true;
    } catch {
      return false;
    }
  }

  async isRunning(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync("pgrep", ["-f", "gemini"]);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
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

    // Load configuration
    await this.loadConfig();

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
    const args: string[] = [];

    // Model selection
    if (options?.model) {
      args.push("--model", options.model);
    }

    // YOLO mode (auto-approve)
    if (options?.permissionMode === "bypassPermissions" || this.config.yoloMode) {
      args.push("--yolo");
    }

    // Single prompt mode
    if (options?.prompt) {
      args.push("-p", options.prompt);
    }

    const commandParts = ["gemini", ...args];
    const command = commandParts.map(quotePosixShellArg).join(" ");
    await this.openInTerminal(command, options?.cwd);
  }

  async continueSession(options?: { cwd?: string }): Promise<void> {
    // Gemini doesn't have a "continue" concept
    // Just start a new session
    await this.spawnSession({ cwd: options?.cwd });
  }

  // ============================================
  // Input Control
  // ============================================

  async approve(): Promise<boolean> {
    return this.sendKeystroke("y");
  }

  async reject(): Promise<boolean> {
    return this.sendKeystroke("n");
  }

  async interrupt(): Promise<boolean> {
    return this.sendKeystroke("c", ["control"]);
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
    // Gemini doesn't have permission modes like Claude
    return false;
  }

  async cycleModel(): Promise<boolean> {
    // Gemini doesn't have a built-in model switcher
    // Would need to restart with different --model flag
    return false;
  }

  async toggleThinking(): Promise<boolean> {
    // Gemini doesn't have a thinking toggle
    return false;
  }

  /**
   * Toggle YOLO mode
   */
  async toggleYoloMode(): Promise<boolean> {
    this.config.yoloMode = !this.config.yoloMode;
    return true;
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

    // Parse state from config.json
    let model: string | undefined;

    const configPath = join(this.geminiConfigDir, "config.json");
    if (existsSync(configPath)) {
      try {
        const content = await readFile(configPath, "utf-8");
        const config = JSON.parse(content);
        model = config.model;
      } catch {
        // Ignore config read errors
      }
    }

    this.currentState = {
      id: this.id,
      name: this.name,
      active: false,
      status: "working",
      hasPermissionPending: false,
      model,
      lastUpdated: new Date().toISOString(),
    };

    return this.currentState;
  }

  startWatching(): void {
    const scheduleRefresh = (): void => {
      if (this.stateDebounceTimer) clearTimeout(this.stateDebounceTimer);
      this.stateDebounceTimer = setTimeout(() => {
        void this.refreshState().then((state) => {
          const updatedAt = Number.isFinite(Date.parse(state.lastUpdated))
            ? Date.parse(state.lastUpdated)
            : Date.now();
          if (updatedAt <= this.lastEmittedUpdatedAt) return;
          this.lastEmittedUpdatedAt = updatedAt;
          this.emit("stateChange", state);
        }).catch(() => {
          // ignore
        });
      }, 100);
    };

    // Watch config file for changes
    const configPath = join(this.geminiConfigDir, "config.json");
    try {
      this.configWatcher?.close();
      if (existsSync(configPath)) {
        this.configWatcher = watch(configPath, () => {
          scheduleRefresh();
        });
      }
    } catch {
      // ignore
    }

    // Poller as fallback
    if (!this.statePoller) {
      this.statePoller = setInterval(scheduleRefresh, 2000);
    }
  }

  stopWatching(): void {
    if (this.configWatcher) {
      this.configWatcher.close();
      this.configWatcher = undefined;
    }
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
  // Gemini-Specific Methods
  // ============================================

  /**
   * Get Gemini CLI version
   */
  async getVersion(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("gemini", ["--version"]);
      return stdout.trim();
    } catch {
      return null;
    }
  }

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

  // ============================================
  // Private Helpers
  // ============================================

  private async loadConfig(): Promise<void> {
    try {
      const configPath = join(this.configDir, "config.json");
      if (existsSync(configPath)) {
        const content = await readFile(configPath, "utf-8");
        const config = JSON.parse(content);
        if (config.terminal?.type) {
          this.terminalType = config.terminal.type;
        }
        if (config.agents?.gemini) {
          this.config = config.agents.gemini;
        }
      }
    } catch {
      // Use defaults
    }
  }

  private async openInTerminal(command: string, cwd?: string): Promise<void> {
    await terminalOpen(this.terminalType, command, cwd);
  }
}

// Singleton instance
export const geminiAgent = new GeminiAgentAdapter();
