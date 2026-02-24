/**
 * Aider Agent Adapter
 *
 * Implements the BaseAgentAdapter for Aider CLI.
 * Aider is an AI pair programming tool that works with local git repos.
 *
 * Key characteristics:
 * - Uses `.aider.lock` file to indicate running session
 * - Chat history stored in `.aider.chat.history.md`
 * - Supports many slash commands for file management and git operations
 * - Auto-commits changes by default
 *
 * @see https://aider.chat/docs/
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
 * Aider configuration options
 */
interface AiderConfig {
  /** Working directory where Aider is running */
  workingDir?: string;
  /** Auto-commit changes */
  autoCommit?: boolean;
  /** Model to use (e.g., "opus", "sonnet", "gpt-4") */
  model?: string;
}

/**
 * Aider Agent Adapter
 */
export class AiderAgentAdapter extends BaseAgentAdapter {
  readonly id = "aider";
  readonly name = "Aider";
  readonly color: AgentColor = AGENT_COLORS.aider;
  readonly command = "aider";
  readonly processNames = ["aider", "python"]; // Aider runs as Python

  readonly capabilities: AgentCapabilities = {
    approve: false, // Aider auto-applies changes, no approval needed
    reject: false,
    interrupt: true,
    modelSwitch: true,
    modeSwitch: false, // No permission modes in Aider
    yoloMode: false,
    planMode: false,
    thinkingToggle: false,
    slashCommands: [
      "/add", "/drop", "/clear", "/commit", "/diff", "/git",
      "/help", "/lint", "/run", "/tokens", "/undo", "/voice",
      "/web", "/quit", "/model", "/ask", "/architect",
    ],
    stateFile: true,
  };

  private configDir: string;
  private currentState: AgentState;
  private terminalType: TerminalType = "kitty";
  private workingDir: string;
  private config: AiderConfig = {};

  private lockWatcher?: FSWatcher;
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
      await execFileAsync("which", ["aider"]);
      return true;
    } catch {
      return false;
    }
  }

  async isRunning(): Promise<boolean> {
    // Check for .aider.lock file in working directory
    const lockPath = this.getLockFilePath();
    if (existsSync(lockPath)) {
      return true;
    }

    // Also check by process name
    try {
      const { stdout } = await execFileAsync("pgrep", ["-f", "aider"]);
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

    // Load any saved configuration
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
      // Aider uses --model or shorthand like --opus, --sonnet
      if (options.model === "opus") {
        args.push("--opus");
      } else if (options.model === "sonnet") {
        args.push("--sonnet");
      } else if (options.model === "haiku") {
        args.push("--model", "claude-3-haiku-20240307");
      } else {
        args.push("--model", options.model);
      }
    }

    // Auto-commit setting
    if (this.config.autoCommit === false) {
      args.push("--no-auto-commits");
    }

    const commandParts = ["aider", ...args];
    const command = commandParts.map(quotePosixShellArg).join(" ");
    await this.openInTerminal(command, options?.cwd ?? this.workingDir);
  }

  async continueSession(options?: { cwd?: string }): Promise<void> {
    // Aider doesn't have a "continue" concept like Claude
    // Just start a new session - it will pick up git context
    await this.spawnSession({ cwd: options?.cwd });
  }

  // ============================================
  // Input Control
  // ============================================

  async approve(): Promise<boolean> {
    // Aider auto-applies changes, no approval needed
    // Send Enter to confirm if there's a prompt
    return this.sendKeystroke("return");
  }

  async reject(): Promise<boolean> {
    // Use /undo to reject the last change
    return this.sendCommand("/undo");
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
    // Aider doesn't have permission modes
    return false;
  }

  async cycleModel(): Promise<boolean> {
    // Send /model command to show model options
    return this.sendCommand("/model");
  }

  async toggleThinking(): Promise<boolean> {
    // Aider doesn't have a thinking toggle
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

    // Parse state from lock file and history
    const lockPath = this.getLockFilePath();
    const historyPath = this.getHistoryFilePath();

    let status: AgentState["status"] = "idle";
    let model: string | undefined;
    let hotFiles: string[] = [];

    // Check lock file for working directory info
    if (existsSync(lockPath)) {
      status = "working";
      try {
        const lockContent = await readFile(lockPath, "utf-8");
        // Lock file may contain the working directory or process info
        if (lockContent.trim()) {
          this.workingDir = lockContent.trim();
        }
      } catch {
        // Ignore lock read errors
      }
    }

    // Parse history for file info and model
    if (existsSync(historyPath)) {
      try {
        const historyContent = await readFile(historyPath, "utf-8");
        const parsed = this.parseHistoryFile(historyContent);
        hotFiles = parsed.files;
        model = parsed.model;
      } catch {
        // Ignore history read errors
      }
    }

    // Try to get model from .aider.conf.yml if present
    if (!model) {
      model = await this.getModelFromConfig();
    }

    this.currentState = {
      id: this.id,
      name: this.name,
      active: false,
      status,
      hasPermissionPending: false,
      model,
      lastUpdated: new Date().toISOString(),
      hotFiles: hotFiles.slice(0, 10),
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

    // Watch lock file for changes
    const lockPath = this.getLockFilePath();
    try {
      this.lockWatcher?.close();
      if (existsSync(lockPath)) {
        this.lockWatcher = watch(lockPath, () => {
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
    if (this.lockWatcher) {
      this.lockWatcher.close();
      this.lockWatcher = undefined;
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
  // Aider-Specific Methods
  // ============================================

  /**
   * Get Aider version
   */
  async getVersion(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("aider", ["--version"]);
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

  /**
   * Add files to the Aider chat
   */
  async addFiles(files: string[]): Promise<boolean> {
    const fileList = files.join(" ");
    return this.sendCommand(`/add ${fileList}`);
  }

  /**
   * Drop files from the Aider chat
   */
  async dropFiles(files: string[]): Promise<boolean> {
    const fileList = files.join(" ");
    return this.sendCommand(`/drop ${fileList}`);
  }

  /**
   * Commit current changes
   */
  async commit(message?: string): Promise<boolean> {
    if (message) {
      return this.sendCommand(`/commit ${message}`);
    }
    return this.sendCommand("/commit");
  }

  /**
   * Show diff of changes
   */
  async showDiff(): Promise<boolean> {
    return this.sendCommand("/diff");
  }

  /**
   * Undo the last change
   */
  async undo(): Promise<boolean> {
    return this.sendCommand("/undo");
  }

  /**
   * Show token usage
   */
  async showTokens(): Promise<boolean> {
    return this.sendCommand("/tokens");
  }

  /**
   * Clear the chat history
   */
  async clearChat(): Promise<boolean> {
    return this.sendCommand("/clear");
  }

  /**
   * Quit Aider
   */
  async quit(): Promise<boolean> {
    return this.sendCommand("/quit");
  }

  // ============================================
  // Private Helpers
  // ============================================

  private getLockFilePath(): string {
    return join(this.workingDir, ".aider.lock");
  }

  private getHistoryFilePath(): string {
    return join(this.workingDir, ".aider.chat.history.md");
  }

  private async loadConfig(): Promise<void> {
    // Load from claude-deck config if present
    try {
      const configPath = join(this.configDir, "config.json");
      if (existsSync(configPath)) {
        const content = await readFile(configPath, "utf-8");
        const config = JSON.parse(content);
        if (config.terminal?.type) {
          this.terminalType = config.terminal.type;
        }
        if (config.agents?.aider) {
          this.config = config.agents.aider;
        }
      }
    } catch {
      // Use defaults
    }
  }

  private async getModelFromConfig(): Promise<string | undefined> {
    // Try to read from .aider.conf.yml
    const configPath = join(this.workingDir, ".aider.conf.yml");
    try {
      if (existsSync(configPath)) {
        const content = await readFile(configPath, "utf-8");
        // Simple YAML parsing for model key
        const match = content.match(/^model:\s*(.+)$/m);
        if (match) {
          return match[1].trim();
        }
      }
    } catch {
      // Ignore
    }
    return undefined;
  }

  private parseHistoryFile(content: string): { files: string[]; model?: string } {
    const files: string[] = [];
    let model: string | undefined;

    const lines = content.split("\n");
    for (const line of lines) {
      // Look for file mentions (usually in the format: "Added file.ts to the chat")
      const addMatch = line.match(/Added\s+(\S+)\s+to the chat/);
      if (addMatch && !files.includes(addMatch[1])) {
        files.push(addMatch[1]);
      }

      // Look for model info
      const modelMatch = line.match(/Using model:\s*(\S+)/);
      if (modelMatch) {
        model = modelMatch[1];
      }
    }

    return { files, model };
  }

  private async openInTerminal(command: string, cwd?: string): Promise<void> {
    const cwdToUse = cwd ?? this.workingDir;
    await terminalOpen(this.terminalType, command, cwdToUse);
  }
}

// Singleton instance
export const aiderAgent = new AiderAgentAdapter();
