import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";

const execAsync = promisify(exec);

/**
 * Supported terminal emulators
 */
export type TerminalType = "kitty" | "ghostty" | "iterm" | "terminal" | "wezterm" | "alacritty";

/**
 * Terminal configuration
 */
export interface TerminalConfig {
  type: TerminalType;
  /** Custom path to terminal executable (optional) */
  path?: string;
}

/**
 * Claude Deck configuration
 */
export interface ClaudeDeckConfig {
  terminal: TerminalConfig;
}

/**
 * State file format for IPC with Claude Code
 */
export interface ClaudeState {
  sessionActive: boolean;
  sessionId?: string;
  currentModel: "sonnet" | "opus" | "haiku";
  permissionMode: "default" | "plan" | "acceptEdits" | "dontAsk" | "bypassPermissions";
  pendingPermission?: {
    type: string;
    tool: string;
    description?: string;
  };
  status: "idle" | "working" | "waiting" | "error";
  lastUpdated: string;

  // Token tracking
  tokens?: {
    input: number;
    output: number;
  };

  // Tool tracking
  lastTool?: string;
  toolCallCount?: number;

  // Timing
  sessionStartTime?: string;
  lastActivityTime?: string;

  // Cost tracking (from Claude's context stats)
  sessionCost?: number;

  // Context window tracking
  contextSize?: number;      // Total context window size
  contextUsed?: number;      // Current tokens used
  contextPercent?: number;   // Percentage used (0-100)
}

/**
 * Command file format for sending commands to Claude Code
 */
export interface ClaudeCommand {
  command: "approve" | "reject" | "interrupt" | "mode-change" | "model-change" | "slash-command";
  payload?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Controller for interacting with Claude Code CLI
 */
export class ClaudeController extends EventEmitter {
  private statePath: string;
  private commandPath: string;
  private configPath: string;
  private configDir: string;
  private currentState: ClaudeState;
  private config: ClaudeDeckConfig;

  constructor() {
    super();
    this.configDir = join(homedir(), ".claude-deck");
    this.statePath = join(this.configDir, "state.json");
    this.commandPath = join(this.configDir, "commands.json");
    this.configPath = join(this.configDir, "config.json");
    this.currentState = this.getDefaultState();
    this.config = this.getDefaultConfig();
  }

  private getDefaultState(): ClaudeState {
    return {
      sessionActive: false,
      currentModel: "sonnet",
      permissionMode: "default",
      status: "idle",
      lastUpdated: new Date().toISOString(),
    };
  }

  private getDefaultConfig(): ClaudeDeckConfig {
    return {
      terminal: {
        type: "kitty", // Default to kitty
      },
    };
  }

  /**
   * Get current terminal type
   */
  getTerminalType(): TerminalType {
    return this.config.terminal.type;
  }

  /**
   * Set terminal type
   */
  async setTerminalType(type: TerminalType): Promise<void> {
    this.config.terminal.type = type;
    await this.saveConfig();
  }

  /**
   * Save configuration to file
   */
  private async saveConfig(): Promise<void> {
    await writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  /**
   * Load configuration from file
   */
  private async loadConfig(): Promise<void> {
    try {
      if (existsSync(this.configPath)) {
        const content = await readFile(this.configPath, "utf-8");
        this.config = { ...this.getDefaultConfig(), ...JSON.parse(content) };
      }
    } catch {
      // Use defaults if config is invalid
      this.config = this.getDefaultConfig();
    }
  }

  /**
   * Get the terminal app name for AppleScript
   */
  private getTerminalAppName(): string {
    const appNames: Record<TerminalType, string> = {
      kitty: "kitty",
      ghostty: "Ghostty",
      iterm: "iTerm",
      terminal: "Terminal",
      wezterm: "WezTerm",
      alacritty: "Alacritty",
    };
    return appNames[this.config.terminal.type];
  }

  /**
   * Initialize the controller - create config directory and start watching
   */
  async initialize(): Promise<void> {
    // Ensure config directory exists
    if (!existsSync(this.configDir)) {
      await mkdir(this.configDir, { recursive: true });
    }

    // Load configuration
    await this.loadConfig();

    // Write initial state if it doesn't exist
    if (!existsSync(this.statePath)) {
      await this.writeState(this.currentState);
    } else {
      // Load existing state
      await this.refreshState();
    }

    // Start watching for state changes
    this.startWatching();
  }

  /**
   * Start watching the state file for changes
   */
  private startWatching(): void {
    // Use polling-based watching for cross-platform compatibility
    let lastModified = 0;

    const checkForChanges = async () => {
      try {
        const content = await readFile(this.statePath, "utf-8");
        const state = JSON.parse(content) as ClaudeState;
        const modified = new Date(state.lastUpdated).getTime();

        if (modified > lastModified) {
          lastModified = modified;
          this.currentState = state;
          this.emit("stateChange", state);
        }
      } catch {
        // File might not exist or be malformed, ignore
      }
    };

    // Check every 500ms
    setInterval(checkForChanges, 500);
  }

  /**
   * Refresh state from file
   */
  async refreshState(): Promise<ClaudeState> {
    try {
      const content = await readFile(this.statePath, "utf-8");
      this.currentState = JSON.parse(content) as ClaudeState;
      return this.currentState;
    } catch {
      return this.currentState;
    }
  }

  /**
   * Write state to file
   */
  private async writeState(state: ClaudeState): Promise<void> {
    state.lastUpdated = new Date().toISOString();
    await writeFile(this.statePath, JSON.stringify(state, null, 2));
    this.currentState = state;
  }

  /**
   * Send a command via the command file (for hooks to pick up)
   */
  async sendCommand(command: ClaudeCommand): Promise<void> {
    command.timestamp = new Date().toISOString();
    await writeFile(this.commandPath, JSON.stringify(command, null, 2));
  }

  /**
   * Get current state
   */
  getState(): ClaudeState {
    return this.currentState;
  }

  /**
   * Check if Claude Code CLI is installed
   */
  async isInstalled(): Promise<boolean> {
    try {
      await execAsync("which claude");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get Claude Code version
   */
  async getVersion(): Promise<string | null> {
    try {
      const { stdout } = await execAsync("claude --version");
      return stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * Start a new Claude Code session
   */
  async startSession(options?: {
    permissionMode?: ClaudeState["permissionMode"];
    model?: ClaudeState["currentModel"];
    prompt?: string;
  }): Promise<void> {
    const args: string[] = [];

    if (options?.permissionMode === "bypassPermissions") {
      args.push("--dangerously-skip-permissions");
    } else if (options?.permissionMode) {
      args.push("--permission-mode", options.permissionMode);
    }

    if (options?.model) {
      args.push("--model", options.model);
    }

    if (options?.prompt) {
      args.push(options.prompt);
    }

    // Open a new terminal window with Claude
    const command = `claude ${args.join(" ")}`;
    await this.openInTerminal(command);
  }

  /**
   * Continue the most recent session
   */
  async continueSession(): Promise<void> {
    await this.openInTerminal("claude -c");
  }

  /**
   * Send a keystroke to the active Claude session
   * Uses AppleScript on macOS to send keystrokes to the configured terminal
   */
  async sendKeystroke(key: string, modifiers: string[] = []): Promise<boolean> {
    try {
      const appName = this.getTerminalAppName();

      // Build AppleScript command
      let keyPress = `key code ${this.getKeyCode(key)}`;
      if (modifiers.length > 0) {
        const modString = modifiers.map((m) => `${m} down`).join(", ");
        keyPress += ` using {${modString}}`;
      }

      // First activate the terminal, then send keystroke
      const script = `
        tell application "${appName}"
          activate
        end tell
        delay 0.1
        tell application "System Events"
          tell process "${appName}"
            ${keyPress}
          end tell
        end tell
      `;

      await execAsync(`osascript -e '${script}'`);
      return true;
    } catch (error) {
      console.error("Failed to send keystroke:", error);
      return false;
    }
  }

  /**
   * Send Ctrl+C to interrupt current operation
   */
  async interrupt(): Promise<boolean> {
    return this.sendKeystroke("c", ["control"]);
  }

  /**
   * Send keystroke to approve (Enter or 'y')
   */
  async approve(): Promise<boolean> {
    // First try writing a command for hooks
    await this.sendCommand({
      command: "approve",
      timestamp: new Date().toISOString(),
    });

    // Also try sending 'y' keystroke
    return this.sendKeystroke("y");
  }

  /**
   * Send keystroke to reject ('n')
   */
  async reject(): Promise<boolean> {
    await this.sendCommand({
      command: "reject",
      timestamp: new Date().toISOString(),
    });

    return this.sendKeystroke("n");
  }

  /**
   * Toggle permission mode (Shift+Tab)
   */
  async togglePermissionMode(): Promise<boolean> {
    return this.sendKeystroke("tab", ["shift"]);
  }

  /**
   * Switch model (Alt+P / Option+P)
   */
  async switchModel(): Promise<boolean> {
    return this.sendKeystroke("p", ["option"]);
  }

  /**
   * Send text to the terminal (types it out)
   */
  async sendText(text: string): Promise<boolean> {
    try {
      const appName = this.getTerminalAppName();
      // Escape special characters for AppleScript
      const escapedText = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

      const script = `
        tell application "${appName}"
          activate
        end tell
        delay 0.1
        tell application "System Events"
          keystroke "${escapedText}"
          delay 0.1
          keystroke return
        end tell
      `;

      await execAsync(`osascript -e '${script}'`);
      return true;
    } catch (error) {
      console.error("Failed to send text:", error);
      return false;
    }
  }

  /**
   * Toggle extended thinking (Alt+T / Option+T)
   */
  async toggleThinking(): Promise<boolean> {
    return this.sendKeystroke("t", ["option"]);
  }

  /**
   * Open a command in a new terminal window
   * Supports: Kitty, Ghostty, iTerm, Terminal.app, WezTerm, Alacritty
   */
  private async openInTerminal(command: string): Promise<void> {
    const terminalType = this.config.terminal.type;
    const escapedCommand = command.replace(/'/g, "'\\''");

    switch (terminalType) {
      case "kitty":
        // Kitty: Use kitten or direct command
        // Launch new window with the command
        await execAsync(`kitty --single-instance --directory ~ sh -c '${escapedCommand}; exec $SHELL'`);
        break;

      case "ghostty":
        // Ghostty: Use ghostty CLI to open new window
        // Ghostty supports -e flag for executing commands
        await execAsync(`open -a Ghostty --args -e sh -c '${escapedCommand}; exec $SHELL'`);
        break;

      case "iterm":
        // iTerm2: Use AppleScript for full control
        const itermScript = `
          tell application "iTerm"
            activate
            create window with default profile
            tell current session of current window
              write text "${command.replace(/"/g, '\\"')}"
            end tell
          end tell
        `;
        await execAsync(`osascript -e '${itermScript}'`);
        break;

      case "terminal":
        // macOS Terminal.app: Use AppleScript
        const terminalScript = `
          tell application "Terminal"
            activate
            do script "${command.replace(/"/g, '\\"')}"
          end tell
        `;
        await execAsync(`osascript -e '${terminalScript}'`);
        break;

      case "wezterm":
        // WezTerm: Use wezterm CLI
        await execAsync(`wezterm start --cwd ~ -- sh -c '${escapedCommand}; exec $SHELL'`);
        break;

      case "alacritty":
        // Alacritty: Use -e flag
        await execAsync(`open -a Alacritty --args -e sh -c '${escapedCommand}; exec $SHELL'`);
        break;

      default:
        // Fallback to system default terminal via open
        await execAsync(`open -a Terminal`);
        // Then use AppleScript to run the command
        const fallbackScript = `
          tell application "Terminal"
            activate
            do script "${command.replace(/"/g, '\\"')}"
          end tell
        `;
        await execAsync(`osascript -e '${fallbackScript}'`);
    }
  }

  /**
   * Focus the terminal window
   */
  async focusTerminal(): Promise<void> {
    const appName = this.getTerminalAppName();
    const script = `tell application "${appName}" to activate`;
    await execAsync(`osascript -e '${script}'`);
  }

  /**
   * Get macOS key code for a character
   */
  private getKeyCode(key: string): number {
    const keyCodes: Record<string, number> = {
      a: 0, b: 11, c: 8, d: 2, e: 14, f: 3, g: 5, h: 4, i: 34, j: 38,
      k: 40, l: 37, m: 46, n: 45, o: 31, p: 35, q: 12, r: 15, s: 1,
      t: 17, u: 32, v: 9, w: 13, x: 7, y: 16, z: 6,
      "0": 29, "1": 18, "2": 19, "3": 20, "4": 21, "5": 23,
      "6": 22, "7": 26, "8": 28, "9": 25,
      return: 36, tab: 48, space: 49, delete: 51, escape: 53,
    };
    return keyCodes[key.toLowerCase()] ?? 0;
  }
}

// Singleton instance
export const claudeController = new ClaudeController();
