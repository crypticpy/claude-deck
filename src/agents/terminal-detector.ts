/**
 * Terminal Detector - Detects focused terminal and running agents
 *
 * This module watches for terminal focus changes and detects which
 * AI coding agent is running in each terminal window.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EventEmitter } from "node:events";
import type { TerminalType } from "./base-agent.js";

const execFileAsync = promisify(execFile);
const isMacOS = process.platform === "darwin";

/**
 * Information about a terminal window
 */
export interface TerminalWindow {
  /** Process ID of the terminal */
  pid: number;
  /** Window title */
  title: string;
  /** Terminal application type */
  app: TerminalType;
  /** Which agent is running in this terminal (if detected) */
  agentId?: string;
  /** Whether this terminal is currently focused */
  focused: boolean;
}

/**
 * Agent process detection patterns
 */
interface AgentPattern {
  id: string;
  /** Process names to look for */
  processNames: string[];
  /** Patterns to match in window title */
  titlePatterns: RegExp[];
}

/**
 * Known agent detection patterns
 */
const AGENT_PATTERNS: AgentPattern[] = [
  {
    id: "claude",
    processNames: ["claude"],
    titlePatterns: [/claude/i, /Claude Code/i],
  },
  {
    id: "aider",
    processNames: ["aider"],
    titlePatterns: [/aider/i],
  },
  {
    id: "codex",
    processNames: ["codex"],
    titlePatterns: [/codex/i],
  },
  {
    id: "gemini",
    processNames: ["gemini"],
    titlePatterns: [/gemini/i],
  },
  {
    id: "opencode",
    processNames: ["opencode"],
    titlePatterns: [/opencode/i],
  },
];

/**
 * Map of terminal app names for detection
 */
const TERMINAL_APPS: Record<string, TerminalType> = {
  kitty: "kitty",
  Kitty: "kitty",
  Ghostty: "ghostty",
  ghostty: "ghostty",
  iTerm: "iterm",
  iTerm2: "iterm",
  Terminal: "terminal",
  WezTerm: "wezterm",
  wezterm: "wezterm",
  Alacritty: "alacritty",
  alacritty: "alacritty",
};

/**
 * Terminal Detector
 *
 * Watches for terminal focus changes and detects which agent is running
 * in each terminal window.
 */
export class TerminalDetector extends EventEmitter {
  private pollInterval?: ReturnType<typeof setInterval>;
  private lastFocusedApp: string | null = null;
  private lastFocusedAgentId: string | null = null;

  /**
   * Get the frontmost application name
   */
  async getFrontmostAppName(): Promise<string | null> {
    if (!isMacOS) return null;
    try {
      const script = `
        tell application "System Events"
          set frontApp to name of first application process whose frontmost is true
          return frontApp
        end tell
      `;
      const { stdout } = await execFileAsync("osascript", ["-e", script]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Get the title of the frontmost window
   */
  async getFrontmostWindowTitle(): Promise<string | null> {
    if (!isMacOS) return null;
    try {
      const script = `
        tell application "System Events"
          set frontApp to first application process whose frontmost is true
          tell frontApp
            try
              set windowTitle to name of front window
              return windowTitle
            on error
              return ""
            end try
          end tell
        end tell
      `;
      const { stdout } = await execFileAsync("osascript", ["-e", script]);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Get the frontmost application name AND window title in a single AppleScript call.
   * Returns both app name and window title, or null if not available.
   */
  async getFrontmostAppInfo(): Promise<{
    appName: string;
    windowTitle: string;
  } | null> {
    if (!isMacOS) return null;
    try {
      const script = `
        tell application "System Events"
          set frontProc to first application process whose frontmost is true
          set appName to name of frontProc
          try
            set winTitle to name of front window of frontProc
          on error
            set winTitle to ""
          end try
          return appName & "|||" & winTitle
        end tell
      `;
      const { stdout } = await execFileAsync("osascript", ["-e", script]);
      const result = stdout.trim();
      if (!result) return null;
      const sepIndex = result.indexOf("|||");
      if (sepIndex === -1) return { appName: result, windowTitle: "" };
      return {
        appName: result.substring(0, sepIndex),
        windowTitle: result.substring(sepIndex + 3),
      };
    } catch {
      return null;
    }
  }

  /**
   * Get the focused terminal info
   */
  async getFocusedTerminal(): Promise<TerminalWindow | null> {
    const info = await this.getFrontmostAppInfo();
    if (!info) return null;

    const terminalType = TERMINAL_APPS[info.appName];
    if (!terminalType) return null;

    const agentId = await this.detectAgentFromTitle(info.windowTitle);

    return {
      pid: 0, // PID detection is more complex; not needed for basic focus tracking
      title: info.windowTitle,
      app: terminalType,
      agentId: agentId ?? undefined,
      focused: true,
    };
  }

  /**
   * Detect which agent is running based on window title
   */
  async detectAgentFromTitle(title: string): Promise<string | null> {
    for (const pattern of AGENT_PATTERNS) {
      for (const regex of pattern.titlePatterns) {
        if (regex.test(title)) {
          return pattern.id;
        }
      }
    }
    return null;
  }

  /**
   * Detect agent by inspecting running processes
   * More accurate but more expensive than title matching
   */
  async detectAgentByProcess(): Promise<string | null> {
    for (const pattern of AGENT_PATTERNS) {
      for (const processName of pattern.processNames) {
        try {
          await execFileAsync("pgrep", ["-x", processName]);
          // If pgrep succeeds, the process is running
          return pattern.id;
        } catch {
          // Process not found
        }
      }
    }
    return null;
  }

  /**
   * Get all running agents based on process detection
   */
  async getRunningAgents(): Promise<string[]> {
    const running: string[] = [];
    for (const pattern of AGENT_PATTERNS) {
      for (const processName of pattern.processNames) {
        try {
          await execFileAsync("pgrep", ["-x", processName]);
          running.push(pattern.id);
          break; // Only add each agent once
        } catch {
          // Process not found
        }
      }
    }
    return running;
  }

  /**
   * Check if a terminal is currently focused
   */
  async isTerminalFocused(): Promise<boolean> {
    const appName = await this.getFrontmostAppName();
    return appName !== null && appName in TERMINAL_APPS;
  }

  /**
   * Start watching for focus changes
   * Emits 'focusChange' events when the focused terminal/agent changes
   */
  startWatching(intervalMs = 750): void {
    this.stopWatching();

    this.pollInterval = setInterval(async () => {
      try {
        const terminal = await this.getFocusedTerminal();

        // Reuse the app name from getFocusedTerminal() result
        // instead of calling getFrontmostAppName() again
        const appName = terminal?.app ?? null;
        const appChanged = appName !== this.lastFocusedApp;
        this.lastFocusedApp = appName;

        // Check if the focused agent changed
        const agentId = terminal?.agentId ?? null;
        const agentChanged = agentId !== this.lastFocusedAgentId;

        if (agentChanged) {
          this.lastFocusedAgentId = agentId;
          this.emit("agentFocusChange", agentId);
        }

        if (appChanged) {
          this.emit("focusChange", terminal);
        }
      } catch (error) {
        console.error("Error polling terminal focus:", error);
      }
    }, intervalMs);
  }

  /**
   * Stop watching for focus changes
   */
  stopWatching(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }
  }

  /**
   * Get the currently focused agent ID
   */
  getLastFocusedAgentId(): string | null {
    return this.lastFocusedAgentId;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopWatching();
    this.removeAllListeners();
  }
}

// Singleton instance
export const terminalDetector = new TerminalDetector();
