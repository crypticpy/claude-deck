/**
 * Agent Registry - Multi-agent support for AI Deck
 *
 * This module exports all agent-related types, classes, and instances.
 * It provides a unified interface for managing multiple AI coding agents.
 */

// Import for local use
import { BaseAgentAdapter } from "./base-agent.js";
import { claudeAgent } from "./claude-agent.js";
import { aiderAgent } from "./aider-agent.js";
import { codexAgent } from "./codex-agent.js";
import { geminiAgent } from "./gemini-agent.js";
import { opencodeAgent } from "./opencode-agent.js";
import { stateAggregator } from "./state-aggregator.js";
import { terminalDetector } from "./terminal-detector.js";
import {
  loadCustomAgents,
  getCustomAgentPatterns,
} from "./custom-agent-loader.js";

// Base types and classes
export {
  BaseAgentAdapter,
  type AgentCapabilities,
  type AgentState,
  type AgentStatus,
  type AgentColor,
  type SpawnOptions,
  type PermissionMode,
  type TerminalType,
  AGENT_COLORS,
  STATUS_COLORS,
} from "./base-agent.js";

// Claude Code agent
export { ClaudeAgentAdapter, claudeAgent } from "./claude-agent.js";

// Aider agent
export { AiderAgentAdapter, aiderAgent } from "./aider-agent.js";

// Codex CLI agent
export { CodexAgentAdapter, codexAgent } from "./codex-agent.js";

// Gemini CLI agent
export { GeminiAgentAdapter, geminiAgent } from "./gemini-agent.js";

// OpenCode agent
export { OpenCodeAgentAdapter, opencodeAgent } from "./opencode-agent.js";

// Terminal detection
export {
  TerminalDetector,
  terminalDetector,
  type TerminalWindow,
  type AgentPattern,
} from "./terminal-detector.js";

// State aggregation
export {
  StateAggregator,
  stateAggregator,
  type AggregatedState,
} from "./state-aggregator.js";

// Custom agent loader (Phase 5)
export {
  CustomAgentAdapter,
  loadCustomAgents,
  getCustomAgentPatterns,
  type CustomAgentConfig,
  type CustomKeybinding,
} from "./custom-agent-loader.js";

/**
 * Agent Registry
 *
 * Maps agent IDs to their adapter instances.
 * Add new agents here as they are implemented.
 */
export const AGENT_REGISTRY: Record<string, BaseAgentAdapter> = {
  claude: claudeAgent,
  aider: aiderAgent,
  codex: codexAgent,
  gemini: geminiAgent,
  opencode: opencodeAgent,
};

/**
 * Get list of all available agent IDs
 */
export function getAvailableAgentIds(): string[] {
  return Object.keys(AGENT_REGISTRY);
}

/**
 * Initialize the default agent setup
 *
 * Call this during plugin startup to register and initialize agents.
 * Registers all available agents but only initializes those that are installed.
 * Also loads any custom agents defined in ~/.claude-deck/custom-agents.json
 */
export async function initializeDefaultAgents(): Promise<void> {
  // Register all built-in agents
  for (const agent of [
    claudeAgent,
    aiderAgent,
    codexAgent,
    geminiAgent,
    opencodeAgent,
  ]) {
    try {
      stateAggregator.registerAgent(agent);
    } catch (error) {
      console.error(`Failed to register agent ${agent.id}:`, error);
    }
  }

  // Load and register custom agents from config file (Phase 5)
  try {
    const customAgents = await loadCustomAgents();
    for (const agent of customAgents) {
      stateAggregator.registerAgent(agent);
      // Also add to registry for macro/action support
      AGENT_REGISTRY[agent.id] = agent;
    }
    if (customAgents.length > 0) {
      console.log(`Loaded ${customAgents.length} custom agent(s)`);

      // Register custom agent patterns with the terminal detector
      const patterns = getCustomAgentPatterns(customAgents);
      for (const pattern of patterns) {
        terminalDetector.registerAgentPattern(pattern);
      }
    }
  } catch (error) {
    console.error("Failed to load custom agents:", error);
  }

  // Initialize all registered agents
  await stateAggregator.initializeAgents();

  // Set Claude as the active agent by default
  stateAggregator.setActiveAgent("claude");

  // Start watching for state changes and terminal focus
  stateAggregator.startWatching();
}

/**
 * Shut down all agents (call on plugin unload)
 */
export function disposeAgents(): void {
  stateAggregator.dispose();
  terminalDetector.dispose();
}
