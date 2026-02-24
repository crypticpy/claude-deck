/**
 * OpenCode Agent Adapter
 *
 * Implements the BaseAgentAdapter for OpenCode CLI.
 * OpenCode is an open-source terminal-based AI coding assistant written in Go.
 *
 * Key characteristics:
 * - Go-based TUI application
 * - Uses .opencode/ directory for project-local state
 * - Supports multiple providers (Anthropic, OpenAI, etc.)
 * - Has session.json for state persistence
 *
 * @see https://github.com/opencode-ai/opencode
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
 * OpenCode configuration options
 */
interface OpenCodeConfig {
  /** Provider to use (anthropic, openai, etc.) */
  provider?: string;
  /** Model to use */
  model?: string;
  /** Debug mode */
  debug?: boolean;
}

/**
 * OpenCode Agent Adapter
 */
export class OpenCodeAgentAdapter extends BaseAgentAdapter {
  readonly id = "opencode";
  readonly name = "OpenCode";
  readonly color: AgentColor = AGENT_COLORS.opencode;
  readonly command = "opencode";
  readonly processNames = ["opencode"];

  readonly capabilities: AgentCapabilities = {
    approve: true,
    reject: true,
    interrupt: true,
    modelSwitch: true,
    modeSwitch: false,
    yoloMode: false,
    planMode: false,
    thinkingToggle: false,
    slashCommands: ["/help"], // Limited slash command support
    stateFile: true,
  };

  private configDir: string;
  private currentState: AgentState;
  private terminalType: TerminalType = "kitty";
  private workingDir: string;
  private config: OpenCodeConfig = {};

  private sessionWatcher?: FSWatcher;
  private statePoller?: ReturnType<typeof setInterval>;
  private stateDebounceTimer?: ReturnType<typeof setTimeout>;
  private lastEmittedUpdatedAt = 0;

  constructor(workingDir?: string) {
    super();
    this.configDir = join(homedir(), ".claude-deck");
    this.workingDir = workingDir ?? process.cwd();
    this.currentState = this.getDefaultState();
  }

  // ============================================
  // Lifecycle Methods
  // ============================================

  async isInstalled(): Promise<boolean> {
    try {
      await execFileAsync("which", ["opencode"]);
      return true;
    } catch {
      return false;
    }
  }

  async isRunning(): Promise<boolean> {
    // Check for .opencode/ directory with session file
    const sessionPath = this.getSessionFilePath();
    if (existsSync(sessionPath)) {
      try {
        const content = await readFile(sessionPath, "utf-8");
        const session = JSON.parse(content);
        if (session.active) {
          return true;
        }
      } catch {
        // Session file exists but couldn't be read
      }
    }

    // Also check by process name
    try {
      const { stdout } = await execFileAsync("pgrep", ["-f", "opencode"]);
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

    // Provider selection
    if (this.config.provider) {
      args.push("--provider", this.config.provider);
    }

    // Model selection
    if (options?.model) {
      args.push("--model", options.model);
    }

    // Debug mode
    if (this.config.debug) {
      args.push("-d");
    }

    const commandParts = ["opencode", ...args];
    const command = commandParts.map(quotePosixShellArg).join(" ");
    await this.openInTerminal(command, options?.cwd ?? this.workingDir);
  }

  async continueSession(options?: { cwd?: string }): Promise<void> {
    // OpenCode maintains session state in .opencode/
    // Just starting it in the same directory should resume
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
    // OpenCode doesn't have permission modes
    return false;
  }

  async cycleModel(): Promise<boolean> {
    // OpenCode doesn't have a built-in model switcher
    return false;
  }

  async toggleThinking(): Promise<boolean> {
    // OpenCode doesn't have a thinking toggle
    return false;
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

    // Parse state from session.json
    let model: string | undefined;
    let status: AgentState["status"] = "working";

    const sessionPath = this.getSessionFilePath();
    if (existsSync(sessionPath)) {
      try {
        const content = await readFile(sessionPath, "utf-8");
        const session = JSON.parse(content);
        model = session.model;
        if (session.status) {
          status = session.status;
        }
      } catch {
        // Ignore session read errors
      }
    }

    this.currentState = {
      id: this.id,
      name: this.name,
      active: false,
      status,
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

    // Watch session file for changes
    const sessionPath = this.getSessionFilePath();
    try {
      this.sessionWatcher?.close();
      if (existsSync(sessionPath)) {
        this.sessionWatcher = watch(sessionPath, () => {
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
    if (this.sessionWatcher) {
      this.sessionWatcher.close();
      this.sessionWatcher = undefined;
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
  // OpenCode-Specific Methods
  // ============================================

  /**
   * Get OpenCode version
   */
  async getVersion(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("opencode", ["--version"]);
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

  /**
   * Set working directory
   */
  setWorkingDir(dir: string): void {
    this.workingDir = dir;
  }

  /**
   * Get working directory
   */
  getWorkingDir(): string {
    return this.workingDir;
  }

  // ============================================
  // Private Helpers
  // ============================================

  private getSessionFilePath(): string {
    return join(this.workingDir, ".opencode", "session.json");
  }

  private async loadConfig(): Promise<void> {
    try {
      const configPath = join(this.configDir, "config.json");
      if (existsSync(configPath)) {
        const content = await readFile(configPath, "utf-8");
        const config = JSON.parse(content);
        if (config.terminal?.type) {
          this.terminalType = config.terminal.type;
        }
        if (config.agents?.opencode) {
          this.config = config.agents.opencode;
        }
      }
    } catch {
      // Use defaults
    }
  }

  private async openInTerminal(command: string, cwd?: string): Promise<void> {
    const cwdToUse = cwd ?? this.workingDir;
    await terminalOpen(this.terminalType, command, cwdToUse);
  }
}

// Singleton instance
export const opencodeAgent = new OpenCodeAgentAdapter();
