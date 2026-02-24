/**
 * State Aggregator - Manages multiple agent states
 *
 * The StateAggregator is the central coordinator for multi-agent support.
 * It tracks all registered agents, their states, and determines which
 * agent is currently active based on terminal focus.
 */

import { EventEmitter } from "node:events";
import type { BaseAgentAdapter, AgentState } from "./base-agent.js";
import { terminalDetector } from "./terminal-detector.js";

/**
 * Aggregated state containing all agents
 */
export interface AggregatedState {
  /** ID of the currently active/focused agent */
  activeAgentId: string | null;
  /** Map of agent ID to agent state */
  agents: Map<string, AgentState>;
  /** When the aggregated state was last updated */
  lastUpdate: Date;
}

/**
 * Events emitted by StateAggregator
 */
export interface StateAggregatorEvents {
  /** Emitted when any agent's state changes */
  stateChange: (state: AggregatedState) => void;
  /** Emitted when the active agent changes */
  activeAgentChange: (
    agentId: string | null,
    previousAgentId: string | null,
  ) => void;
  /** Emitted when an agent becomes available/unavailable */
  agentAvailabilityChange: (agentId: string, available: boolean) => void;
}

/**
 * State Aggregator
 *
 * Manages multiple AI coding agents and their states, coordinating
 * which agent is active based on terminal focus.
 */
export class StateAggregator extends EventEmitter {
  private agents: Map<string, BaseAgentAdapter> = new Map();
  private agentStates: Map<string, AgentState> = new Map();
  private agentHandlers: Map<string, (state: AgentState) => void> = new Map();
  private activeAgentId: string | null = null;
  private isWatching = false;
  private autoSwitchOnFocus = true;
  private boundAgentFocusHandler?: (agentId: string | null) => void;

  /**
   * Register an agent adapter
   */
  registerAgent(adapter: BaseAgentAdapter): void {
    this.agents.set(adapter.id, adapter);
    this.agentStates.set(adapter.id, adapter.getDefaultState());

    // Listen for state changes from this agent (store handler for targeted removal)
    const handler = (state: AgentState) => {
      this.agentStates.set(adapter.id, state);
      this.emitAggregatedState();
    };
    adapter.on("stateChange", handler);
    this.agentHandlers.set(adapter.id, handler);
  }

  /**
   * Unregister an agent adapter
   */
  unregisterAgent(agentId: string): void {
    const adapter = this.agents.get(agentId);
    const handler = this.agentHandlers.get(agentId);
    if (adapter && handler) {
      adapter.removeListener("stateChange", handler);
    }
    if (adapter) {
      adapter.dispose();
    }
    this.agentHandlers.delete(agentId);
    this.agents.delete(agentId);
    this.agentStates.delete(agentId);

    if (this.activeAgentId === agentId) {
      this.activeAgentId = null;
      this.emit("activeAgentChange", null, agentId);
    }
  }

  /**
   * Get all registered agent IDs
   */
  getAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Get a specific agent adapter
   */
  getAgent(agentId: string): BaseAgentAdapter | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agent adapters
   */
  getAgents(): BaseAgentAdapter[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get the currently active agent
   */
  getActiveAgent(): BaseAgentAdapter | null {
    if (!this.activeAgentId) return null;
    return this.agents.get(this.activeAgentId) ?? null;
  }

  /**
   * Get the active agent ID
   */
  getActiveAgentId(): string | null {
    return this.activeAgentId;
  }

  /**
   * Set the active agent
   * @param agentId - Agent to make active, or null to clear
   */
  setActiveAgent(agentId: string | null): void {
    if (agentId === this.activeAgentId) return;

    const previousId = this.activeAgentId;
    this.activeAgentId = agentId;

    // Update active flag in agent states
    for (const [id, state] of this.agentStates) {
      state.active = id === agentId;
    }

    this.emit("activeAgentChange", agentId, previousId);
    this.emitAggregatedState();
  }

  /**
   * Get aggregated state of all agents
   */
  getState(): AggregatedState {
    return {
      activeAgentId: this.activeAgentId,
      agents: new Map(this.agentStates),
      lastUpdate: new Date(),
    };
  }

  /**
   * Get state for a specific agent
   */
  getAgentState(agentId: string): AgentState | undefined {
    return this.agentStates.get(agentId);
  }

  /**
   * Initialize all registered agents
   */
  async initializeAgents(): Promise<void> {
    const initPromises = Array.from(this.agents.values()).map(async (agent) => {
      try {
        await agent.initialize();
        const state = await agent.refreshState();
        this.agentStates.set(agent.id, state);
      } catch (error) {
        console.error(`Failed to initialize agent ${agent.id}:`, error);
      }
    });

    await Promise.all(initPromises);
    this.emitAggregatedState();
  }

  /**
   * Check which agents are currently installed
   */
  async checkInstalledAgents(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    for (const [id, agent] of this.agents) {
      try {
        results.set(id, await agent.isInstalled());
      } catch {
        results.set(id, false);
      }
    }
    return results;
  }

  /**
   * Check which agents are currently running
   */
  async checkRunningAgents(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    for (const [id, agent] of this.agents) {
      try {
        results.set(id, await agent.isRunning());
      } catch {
        results.set(id, false);
      }
    }
    return results;
  }

  /**
   * Start watching all agents and terminal focus
   */
  startWatching(): void {
    if (this.isWatching) return;
    this.isWatching = true;

    // Start watching each agent
    for (const agent of this.agents.values()) {
      agent.startWatching();
    }

    // Start watching terminal focus (store bound handler for proper removal)
    this.boundAgentFocusHandler = this.handleAgentFocusChange.bind(this);
    terminalDetector.on("agentFocusChange", this.boundAgentFocusHandler);
    terminalDetector.startWatching();
  }

  /**
   * Stop watching all agents and terminal focus
   */
  stopWatching(): void {
    if (!this.isWatching) return;
    this.isWatching = false;

    for (const agent of this.agents.values()) {
      agent.stopWatching();
    }

    // Remove the stored bound handler
    if (this.boundAgentFocusHandler) {
      terminalDetector.removeListener(
        "agentFocusChange",
        this.boundAgentFocusHandler,
      );
      this.boundAgentFocusHandler = undefined;
    }
    terminalDetector.stopWatching();
  }

  /**
   * Enable or disable auto-switching active agent on terminal focus
   */
  setAutoSwitchOnFocus(enabled: boolean): void {
    this.autoSwitchOnFocus = enabled;
  }

  /**
   * Refresh state for all agents
   */
  async refreshAllStates(): Promise<void> {
    const refreshPromises = Array.from(this.agents.values()).map(
      async (agent) => {
        try {
          const state = await agent.refreshState();
          this.agentStates.set(agent.id, state);
        } catch {
          // Keep existing state on error
        }
      },
    );

    await Promise.all(refreshPromises);
    this.emitAggregatedState();
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    this.stopWatching();
    for (const agent of this.agents.values()) {
      agent.dispose();
    }
    this.agents.clear();
    this.agentStates.clear();
    this.removeAllListeners();
  }

  // ============================================
  // Universal Actions - Send to Active Agent
  // ============================================

  /**
   * Send approve to the active agent
   */
  async approve(): Promise<boolean> {
    const agent = this.getActiveAgent();
    if (!agent || !agent.capabilities.approve) return false;
    return agent.approve();
  }

  /**
   * Send reject to the active agent
   */
  async reject(): Promise<boolean> {
    const agent = this.getActiveAgent();
    if (!agent || !agent.capabilities.reject) return false;
    return agent.reject();
  }

  /**
   * Send interrupt to the active agent
   */
  async interrupt(): Promise<boolean> {
    const agent = this.getActiveAgent();
    if (!agent || !agent.capabilities.interrupt) return false;
    return agent.interrupt();
  }

  /**
   * Cycle mode on the active agent
   */
  async cycleMode(): Promise<boolean> {
    const agent = this.getActiveAgent();
    if (!agent || !agent.capabilities.modeSwitch) return false;
    return agent.cycleMode();
  }

  /**
   * Cycle model on the active agent
   */
  async cycleModel(): Promise<boolean> {
    const agent = this.getActiveAgent();
    if (!agent || !agent.capabilities.modelSwitch) return false;
    return agent.cycleModel();
  }

  /**
   * Send a command to the active agent
   */
  async sendCommand(command: string): Promise<boolean> {
    const agent = this.getActiveAgent();
    if (!agent) return false;
    return agent.sendCommand(command);
  }

  /**
   * Spawn a new session for an agent
   */
  async spawnSession(
    agentId: string,
    options?: Parameters<BaseAgentAdapter["spawnSession"]>[0],
  ): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Unknown agent: ${agentId}`);
    await agent.spawnSession(options);
  }

  /**
   * Continue session for an agent
   */
  async continueSession(
    agentId: string,
    options?: { cwd?: string },
  ): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Unknown agent: ${agentId}`);
    await agent.continueSession(options);
  }

  // ============================================
  // Private Helpers
  // ============================================

  private handleAgentFocusChange(agentId: string | null): void {
    if (!this.autoSwitchOnFocus) return;

    // Only switch if the detected agent is registered
    if (agentId && !this.agents.has(agentId)) return;

    this.setActiveAgent(agentId);
  }

  private emitAggregatedState(): void {
    this.emit("stateChange", this.getState());
  }
}

// Singleton instance
export const stateAggregator = new StateAggregator();
