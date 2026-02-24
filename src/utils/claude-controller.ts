/**
 * Claude Controller - Backwards-compatible wrapper for ClaudeAgentAdapter
 *
 * This module provides the original ClaudeController interface for backwards
 * compatibility. Internally, it delegates to the new multi-agent system.
 *
 * New code should use the agents module directly:
 * - import { claudeAgent } from "../agents/claude-agent.js"
 * - import { stateAggregator } from "../agents/state-aggregator.js"
 *
 * @deprecated Use the agents module for new code
 */

import { EventEmitter } from "node:events";
import { claudeAgent, ClaudeAgentAdapter } from "../agents/claude-agent.js";
import { terminalDetector } from "../agents/terminal-detector.js";
import type { TerminalType, PermissionMode } from "../agents/base-agent.js";

// Re-export types for backwards compatibility
export type { TerminalType } from "../agents/base-agent.js";

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
 *
 * @deprecated Use AgentState from agents/base-agent.ts
 */
export interface ClaudeState {
  sessionActive: boolean;
  sessionId?: string;
  currentModel: "sonnet" | "opus" | "haiku";
  permissionMode:
    | "default"
    | "plan"
    | "acceptEdits"
    | "dontAsk"
    | "bypassPermissions";
  pendingPermission?: {
    type: string;
    tool: string;
    description?: string;
    requestedAt?: string;
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
  toolUsage?: Record<string, number>;
  hotFiles?: string[];

  // Timing
  sessionStartTime?: string;
  lastActivityTime?: string;

  // Cost tracking (from Claude's context stats)
  sessionCost?: number;

  // Context window tracking
  contextSize?: number;
  contextUsed?: number;
  contextPercent?: number;
}

/**
 * Command file format for sending commands to Claude Code
 */
export interface ClaudeCommand {
  command:
    | "approve"
    | "reject"
    | "interrupt"
    | "mode-change"
    | "model-change"
    | "slash-command";
  payload?: Record<string, unknown>;
  timestamp?: string;
}

/**
 * Controller for interacting with Claude Code CLI
 *
 * @deprecated Use ClaudeAgentAdapter from agents/claude-agent.ts for new code
 */
export class ClaudeController extends EventEmitter {
  private adapter: ClaudeAgentAdapter;
  private initialized = false;

  constructor() {
    super();
    this.adapter = claudeAgent; // Use singleton instead of creating a second instance

    // Forward state change events
    this.adapter.on("stateChange", (state) => {
      this.emit("stateChange", this.agentStateToClaudeState(state));
    });
  }

  /**
   * Convert AgentState to ClaudeState for backwards compatibility
   */
  private agentStateToClaudeState(
    agentState: ReturnType<ClaudeAgentAdapter["getState"]>,
  ): ClaudeState {
    return {
      sessionActive: agentState.status !== "disconnected",
      sessionId: undefined,
      currentModel:
        (agentState.model as "sonnet" | "opus" | "haiku") ?? "sonnet",
      permissionMode:
        (agentState.mode as ClaudeState["permissionMode"]) ?? "default",
      pendingPermission: agentState.pendingPermission,
      status: agentState.status === "disconnected" ? "idle" : agentState.status,
      lastUpdated: agentState.lastUpdated,
      tokens: agentState.tokens,
      toolUsage: agentState.toolUsage,
      hotFiles: agentState.hotFiles,
      sessionStartTime: agentState.sessionStartTime,
      lastActivityTime: agentState.lastActivityTime,
      sessionCost: agentState.cost,
      contextPercent: agentState.contextPercent,
    };
  }

  /**
   * Get current terminal type
   */
  getTerminalType(): TerminalType {
    return this.adapter.getTerminalType();
  }

  /**
   * Set terminal type
   */
  async setTerminalType(type: TerminalType): Promise<void> {
    this.adapter.setTerminalType(type);
  }

  /**
   * Initialize the controller
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    // Initialization is handled by initializeDefaultAgents() in plugin.ts
    // We just need to mark ourselves as ready
    this.initialized = true;
  }

  /**
   * Refresh state from file
   */
  async refreshState(): Promise<ClaudeState> {
    const agentState = await this.adapter.refreshState();
    return this.agentStateToClaudeState(agentState);
  }

  /**
   * Get current state
   */
  getState(): ClaudeState {
    return this.agentStateToClaudeState(this.adapter.getState());
  }

  /**
   * Check if Claude Code CLI is installed
   */
  async isInstalled(): Promise<boolean> {
    return this.adapter.isInstalled();
  }

  /**
   * Get Claude Code version
   */
  async getVersion(): Promise<string | null> {
    return this.adapter.getVersion();
  }

  /**
   * Start a new Claude Code session
   */
  async startSession(options?: {
    permissionMode?: ClaudeState["permissionMode"];
    model?: ClaudeState["currentModel"];
    prompt?: string;
  }): Promise<void> {
    await this.adapter.spawnSession({
      permissionMode: options?.permissionMode as PermissionMode,
      model: options?.model,
      prompt: options?.prompt,
    });
  }

  /**
   * Continue the most recent session
   */
  async continueSession(): Promise<void> {
    await this.adapter.continueSession();
  }

  /**
   * Continue the most recent session for a specific Claude project directory
   */
  async continueSessionInDirectory(projectDir: string): Promise<void> {
    await this.adapter.continueSession({ cwd: projectDir });
  }

  /**
   * Send a keystroke to the active Claude session
   */
  async sendKeystroke(key: string, modifiers: string[] = []): Promise<boolean> {
    return this.adapter.sendKeystroke(key, modifiers);
  }

  /**
   * Send Ctrl+C to interrupt current operation
   */
  async interrupt(): Promise<boolean> {
    return this.adapter.interrupt();
  }

  /**
   * Send keystroke to approve
   */
  async approve(): Promise<boolean> {
    return this.adapter.approve();
  }

  /**
   * Send keystroke to reject
   */
  async reject(): Promise<boolean> {
    return this.adapter.reject();
  }

  /**
   * Toggle permission mode (Shift+Tab)
   */
  async togglePermissionMode(): Promise<boolean> {
    return this.adapter.cycleMode();
  }

  /**
   * Switch model (Alt+P / Option+P)
   */
  async switchModel(): Promise<boolean> {
    return this.adapter.cycleModel();
  }

  /**
   * Send text to the terminal
   */
  async sendText(text: string): Promise<boolean> {
    return this.adapter.sendText(text);
  }

  /**
   * Toggle extended thinking (Alt+T / Option+T)
   */
  async toggleThinking(): Promise<boolean> {
    return this.adapter.toggleThinking();
  }

  /**
   * Set the permission mode in state
   */
  async setPermissionMode(mode: ClaudeState["permissionMode"]): Promise<void> {
    await this.adapter.setPermissionMode(mode as PermissionMode);
  }

  /**
   * Open a command in a new terminal window
   */
  async openTerminalCommand(
    command: string,
    options?: { cwd?: string },
  ): Promise<void> {
    // Use internal spawnSession with a custom command
    // For backwards compatibility, we'll use sendText approach
    await this.adapter.spawnSession({ prompt: command, cwd: options?.cwd });
  }

  /**
   * Focus the terminal window
   */
  async focusTerminal(): Promise<void> {
    await this.adapter.focusTerminal();
  }

  /**
   * Get the frontmost macOS app name
   */
  async getFrontmostAppName(): Promise<string | null> {
    return terminalDetector.getFrontmostAppName();
  }

  /**
   * Returns true if the configured terminal is currently frontmost
   */
  async isTerminalFocused(): Promise<boolean> {
    return this.adapter.isTerminalFocused();
  }

  /**
   * Best-effort detection of whether a terminal process is running
   */
  async isTerminalRunning(_type?: TerminalType): Promise<boolean> {
    // For backwards compatibility, just check if the adapter is running
    return this.adapter.isRunning();
  }

  /**
   * Send a command via the command file
   * @deprecated Use adapter methods directly
   */
  async sendCommand(command: ClaudeCommand): Promise<void> {
    // This is handled internally by the adapter now
    if (command.command === "approve") {
      await this.approve();
    } else if (command.command === "reject") {
      await this.reject();
    } else if (command.command === "interrupt") {
      await this.interrupt();
    }
  }
}

// Singleton instance - backwards compatible
export const claudeController = new ClaudeController();
