/**
 * Base Agent Adapter - Abstract class for multi-agent support
 *
 * This module provides the foundation for integrating multiple AI coding agents
 * with the Stream Deck. Each agent (Claude, Aider, Codex, etc.) extends this
 * base class and implements agent-specific behavior.
 */

import { EventEmitter } from "node:events";

/**
 * Agent capabilities - what features each agent supports
 */
export interface AgentCapabilities {
  /** Can approve tool use/file edits (y/Enter) */
  approve: boolean;
  /** Can reject tool use/file edits (n) */
  reject: boolean;
  /** Can interrupt with Ctrl+C */
  interrupt: boolean;
  /** Supports switching models at runtime */
  modelSwitch: boolean;
  /** Supports cycling permission modes */
  modeSwitch: boolean;
  /** Has a YOLO/auto-approve mode */
  yoloMode: boolean;
  /** Has a plan-only mode */
  planMode: boolean;
  /** List of supported slash commands */
  slashCommands: string[];
  /** Uses a state file for IPC */
  stateFile: boolean;
  /** Supports extended thinking toggle */
  thinkingToggle: boolean;
}

/**
 * Agent status
 */
export type AgentStatus = "idle" | "working" | "waiting" | "error" | "disconnected";

/**
 * Permission modes (primarily for Claude, other agents may have simpler modes)
 */
export type PermissionMode = "default" | "plan" | "acceptEdits" | "dontAsk" | "bypassPermissions" | "yolo" | "auto";

/**
 * Agent state - current status and metrics
 */
export interface AgentState {
  /** Unique agent identifier */
  id: string;
  /** Display name */
  name: string;
  /** Whether this agent is currently focused/active */
  active: boolean;
  /** Current operational status */
  status: AgentStatus;
  /** Whether agent is waiting for user permission */
  hasPermissionPending: boolean;
  /** Current model being used */
  model?: string;
  /** Current permission/operation mode */
  mode?: PermissionMode | string;
  /** Context window usage percentage (0-100) */
  contextPercent?: number;
  /** Session cost in dollars */
  cost?: number;
  /** Token usage */
  tokens?: { input: number; output: number };
  /** PID of terminal running this agent */
  terminalPid?: number;
  /** When the agent state was last updated */
  lastUpdated: string;
  /** When the session started */
  sessionStartTime?: string;
  /** Last activity timestamp */
  lastActivityTime?: string;
  /** Pending permission details */
  pendingPermission?: {
    type: string;
    tool: string;
    description?: string;
    requestedAt?: string;
  };
  /** Tool usage statistics */
  toolUsage?: Record<string, number>;
  /** Recently accessed files */
  hotFiles?: string[];
}

/**
 * Options for spawning a new agent session
 */
export interface SpawnOptions {
  /** Initial permission mode */
  permissionMode?: PermissionMode;
  /** Model to use */
  model?: string;
  /** Initial prompt to send */
  prompt?: string;
  /** Working directory */
  cwd?: string;
  /** Continue previous session */
  continue?: boolean;
}

/**
 * Supported terminal emulators
 */
export type TerminalType = "kitty" | "ghostty" | "iterm" | "terminal" | "wezterm" | "alacritty";

/**
 * Agent color configuration
 */
export interface AgentColor {
  /** Primary brand color (hex) */
  primary: string;
  /** Muted/inactive color (hex) */
  muted: string;
}

/**
 * Default agent colors from PRD
 */
export const AGENT_COLORS: Record<string, AgentColor> = {
  claude: { primary: "#AF52DE", muted: "#5C2E76" },
  codex: { primary: "#00C853", muted: "#006B2C" },
  gemini: { primary: "#4285F4", muted: "#234785" },
  aider: { primary: "#FFC107", muted: "#8A6800" },
  opencode: { primary: "#FF9800", muted: "#8A5200" },
  factory: { primary: "#00BCD4", muted: "#006573" },
};

/**
 * Status colors (universal across all agents)
 */
export const STATUS_COLORS = {
  idle: "#888888",
  working: "#00FF00",
  waiting: "#FFFF00",
  error: "#FF3B30",
  disconnected: "#444444",
} as const;

/**
 * Abstract base class for agent adapters
 *
 * Each AI coding agent (Claude, Aider, Codex, etc.) must implement this interface
 * to be controllable from the Stream Deck.
 */
export abstract class BaseAgentAdapter extends EventEmitter {
  /** Unique identifier for this agent type (e.g., "claude", "aider") */
  abstract readonly id: string;

  /** Human-readable display name */
  abstract readonly name: string;

  /** Agent brand color (hex) */
  abstract readonly color: AgentColor;

  /** What this agent can do */
  abstract readonly capabilities: AgentCapabilities;

  /** CLI command to run this agent */
  abstract readonly command: string;

  /** Process names to look for when detecting running instances */
  abstract readonly processNames: string[];

  // ============================================
  // Lifecycle Methods
  // ============================================

  /**
   * Check if the agent CLI is installed on the system
   */
  abstract isInstalled(): Promise<boolean>;

  /**
   * Check if the agent is currently running in any terminal
   */
  abstract isRunning(): Promise<boolean>;

  /**
   * Detect current session and return state, or null if no session found
   */
  abstract detectSession(): Promise<AgentState | null>;

  /**
   * Initialize the agent adapter (create config dirs, load state, etc.)
   */
  abstract initialize(): Promise<void>;

  /**
   * Clean up resources (stop watchers, close connections)
   */
  abstract dispose(): void;

  // ============================================
  // Session Control
  // ============================================

  /**
   * Spawn a new agent session in a terminal window
   */
  abstract spawnSession(options?: SpawnOptions): Promise<void>;

  /**
   * Continue the most recent session
   */
  abstract continueSession(options?: { cwd?: string }): Promise<void>;

  // ============================================
  // Input Control
  // ============================================

  /**
   * Approve the current permission request
   * @returns true if keystroke was sent successfully
   */
  abstract approve(): Promise<boolean>;

  /**
   * Reject the current permission request
   * @returns true if keystroke was sent successfully
   */
  abstract reject(): Promise<boolean>;

  /**
   * Interrupt the current operation (Ctrl+C)
   * @returns true if keystroke was sent successfully
   */
  abstract interrupt(): Promise<boolean>;

  /**
   * Send a keystroke to the agent's terminal
   * @param key - Key to press (e.g., "a", "return", "tab")
   * @param modifiers - Modifier keys (e.g., ["control"], ["shift", "command"])
   */
  abstract sendKeystroke(key: string, modifiers?: string[]): Promise<boolean>;

  /**
   * Send a slash command or text to the agent
   * @param command - Command to send (e.g., "/commit", "/help")
   */
  abstract sendCommand(command: string): Promise<boolean>;

  /**
   * Send arbitrary text to the terminal (types it out)
   */
  abstract sendText(text: string): Promise<boolean>;

  // ============================================
  // Mode/Model Control
  // ============================================

  /**
   * Toggle or cycle the permission/operation mode
   * @returns true if successful
   */
  abstract cycleMode(): Promise<boolean>;

  /**
   * Switch to the next model
   * @returns true if successful
   */
  abstract cycleModel(): Promise<boolean>;

  /**
   * Toggle extended thinking mode (if supported)
   * @returns true if successful
   */
  abstract toggleThinking(): Promise<boolean>;

  // ============================================
  // State Management
  // ============================================

  /**
   * Get current agent state
   */
  abstract getState(): AgentState;

  /**
   * Force refresh state from source (file, process, etc.)
   */
  abstract refreshState(): Promise<AgentState>;

  /**
   * Start watching for state changes
   * Emits 'stateChange' events when state updates
   */
  abstract startWatching(): void;

  /**
   * Stop watching for state changes
   */
  abstract stopWatching(): void;

  // ============================================
  // Terminal Control
  // ============================================

  /**
   * Focus the terminal window running this agent
   */
  abstract focusTerminal(): Promise<void>;

  /**
   * Check if the agent's terminal is currently focused
   */
  abstract isTerminalFocused(): Promise<boolean>;

  // ============================================
  // Helper Methods (implemented in base class)
  // ============================================

  /**
   * Get a default/disconnected state for this agent
   */
  getDefaultState(): AgentState {
    return {
      id: this.id,
      name: this.name,
      active: false,
      status: "disconnected",
      hasPermissionPending: false,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Check if a capability is supported
   */
  hasCapability(capability: keyof AgentCapabilities): boolean {
    const cap = this.capabilities[capability];
    if (typeof cap === "boolean") return cap;
    if (Array.isArray(cap)) return cap.length > 0;
    return false;
  }

  /**
   * Get status color based on current state
   */
  getStatusColor(status: AgentStatus): string {
    return STATUS_COLORS[status] ?? STATUS_COLORS.idle;
  }
}
