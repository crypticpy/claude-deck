import {
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { stateAggregator, type AggregatedState } from "../agents/state-aggregator.js";
import type { AgentState } from "../agents/base-agent.js";

/**
 * Stats view modes for cycling through different analytics displays
 */
type StatsView = "summary" | "tokens" | "time" | "tools";

/**
 * Aggregated analytics data across all agents
 */
interface AnalyticsData {
  totalCost: number;
  activeAgentCount: number;
  totalAgentCount: number;
  agentTokens: Map<string, { input: number; output: number }>;
  agentTimes: Map<string, number>; // session duration in seconds
  toolUsage: Map<string, number>; // tool name -> usage count
}

// Pricing per 1M tokens
const PRICING: Record<string, { input: number; output: number }> = {
  opus: { input: 15.0, output: 75.0 },
  "opus-4": { input: 15.0, output: 75.0 },
  "claude-opus-4-5-20251101": { input: 15.0, output: 75.0 },
  sonnet: { input: 3.0, output: 15.0 },
  "sonnet-4": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  haiku: { input: 0.25, output: 1.25 },
};

/**
 * Usage Analytics Action - Displays aggregated usage across all agents
 *
 * Shows total cost, tokens, session time, and tool usage across all registered agents.
 * Click to cycle through different stats views.
 */
export class UsageAnalyticsAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.usage-analytics";

  private updateHandler?: (state: AggregatedState) => void;
  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private viewByAction = new Map<string, StatsView>();
  private refreshInterval?: ReturnType<typeof setInterval>;

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    this.viewByAction.set(ev.action.id, "summary");
    await this.updateDisplay(ev.action, stateAggregator.getState());

    if (!this.updateHandler) {
      this.updateHandler = (state: AggregatedState) => {
        void this.updateAllWithState(state).catch(() => {
          // ignore
        });
      };
      stateAggregator.on("stateChange", this.updateHandler);
    }

    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(() => {
        void this.updateAll().catch(() => {
          // ignore
        });
      }, 5000); // Update every 5 seconds
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    this.viewByAction.delete(ev.action.id);

    if (this.activeActions.size === 0 && this.updateHandler) {
      stateAggregator.off("stateChange", this.updateHandler);
      this.updateHandler = undefined;
    }
    if (this.activeActions.size === 0 && this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    // Cycle through stats views
    const currentView = this.viewByAction.get(ev.action.id) ?? "summary";
    const views: StatsView[] = ["summary", "tokens", "time", "tools"];
    const currentIndex = views.indexOf(currentView);
    const nextView = views[(currentIndex + 1) % views.length];
    this.viewByAction.set(ev.action.id, nextView);
    await this.updateDisplay(ev.action, stateAggregator.getState());
  }

  private async updateAll(): Promise<void> {
    if (this.activeActions.size === 0) return;
    await this.updateAllWithState(stateAggregator.getState());
  }

  private async updateAllWithState(state: AggregatedState): Promise<void> {
    await Promise.allSettled(
      [...this.activeActions.entries()].map(([id, action]) =>
        this.updateDisplay(action, state, this.viewByAction.get(id) ?? "summary")
      )
    );
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
    state: AggregatedState,
    view?: StatsView
  ): Promise<void> {
    const currentView = view ?? this.viewByAction.get(action.id) ?? "summary";
    const analytics = this.aggregateAnalytics(state);
    const svg = this.createSvg(analytics, currentView);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private aggregateAnalytics(state: AggregatedState): AnalyticsData {
    let totalCost = 0;
    let activeAgentCount = 0;
    const agentTokens = new Map<string, { input: number; output: number }>();
    const agentTimes = new Map<string, number>();
    const toolUsage = new Map<string, number>();

    for (const [agentId, agentState] of state.agents) {
      // Count active agents
      if (agentState.status !== "disconnected") {
        activeAgentCount++;
      }

      // Aggregate cost
      const agentCost = this.getAgentCost(agentState);
      totalCost += agentCost;

      // Aggregate tokens
      if (agentState.tokens) {
        agentTokens.set(agentId, {
          input: agentState.tokens.input,
          output: agentState.tokens.output,
        });
      }

      // Calculate session time
      if (agentState.sessionStartTime) {
        const startTime = new Date(agentState.sessionStartTime).getTime();
        const now = Date.now();
        const durationSeconds = Math.floor((now - startTime) / 1000);
        if (durationSeconds > 0) {
          agentTimes.set(agentId, durationSeconds);
        }
      }

      // Aggregate tool usage
      if (agentState.toolUsage) {
        for (const [tool, count] of Object.entries(agentState.toolUsage)) {
          const existing = toolUsage.get(tool) ?? 0;
          toolUsage.set(tool, existing + count);
        }
      }
    }

    return {
      totalCost,
      activeAgentCount,
      totalAgentCount: state.agents.size,
      agentTokens,
      agentTimes,
      toolUsage,
    };
  }

  private getAgentCost(state: AgentState): number {
    // Use direct cost if available
    if (state.cost !== undefined && state.cost > 0) {
      return state.cost;
    }
    // Estimate from tokens
    const tokens = state.tokens || { input: 0, output: 0 };
    const model = (state.model || "sonnet").toLowerCase();
    const prices = PRICING[model] || PRICING.sonnet;
    return (tokens.input / 1_000_000) * prices.input + (tokens.output / 1_000_000) * prices.output;
  }

  private formatCost(cost: number): string {
    if (cost < 0.01) return "<$0.01";
    if (cost < 1) return `$${cost.toFixed(2)}`;
    return `$${cost.toFixed(2)}`;
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  private formatTokens(count: number): string {
    if (count < 1000) return `${count}`;
    if (count < 1_000_000) return `${(count / 1000).toFixed(1)}K`;
    return `${(count / 1_000_000).toFixed(2)}M`;
  }

  private createSvg(analytics: AnalyticsData, view: StatsView): string {
    switch (view) {
      case "summary":
        return this.createSummarySvg(analytics);
      case "tokens":
        return this.createTokensSvg(analytics);
      case "time":
        return this.createTimeSvg(analytics);
      case "tools":
        return this.createToolsSvg(analytics);
      default:
        return this.createSummarySvg(analytics);
    }
  }

  private createSummarySvg(analytics: AnalyticsData): string {
    // Color based on cost
    let costColor = "#22c55e"; // Green
    if (analytics.totalCost > 1.0) costColor = "#eab308"; // Yellow
    if (analytics.totalCost > 5.0) costColor = "#f97316"; // Orange
    if (analytics.totalCost > 15.0) costColor = "#ef4444"; // Red

    const agentStatusColor = analytics.activeAgentCount > 0 ? "#22c55e" : "#64748b";

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Title -->
        <text x="72" y="20" font-family="system-ui, sans-serif" font-size="10" fill="#64748b" text-anchor="middle">USAGE ANALYTICS</text>

        <!-- Total Cost -->
        <text x="72" y="55" font-family="system-ui, sans-serif" font-size="24" fill="${costColor}" text-anchor="middle" font-weight="bold">${this.formatCost(analytics.totalCost)}</text>
        <text x="72" y="72" font-family="system-ui, sans-serif" font-size="10" fill="#94a3b8" text-anchor="middle">total cost</text>

        <!-- Agent Count -->
        <rect x="30" y="85" width="84" height="30" rx="6" fill="#1e293b"/>
        <circle cx="50" cy="100" r="6" fill="${agentStatusColor}"/>
        <text x="62" y="104" font-family="system-ui, sans-serif" font-size="12" fill="#e2e8f0">${analytics.activeAgentCount}/${analytics.totalAgentCount} agents</text>

        <!-- View indicator -->
        <text x="72" y="134" font-family="system-ui, sans-serif" font-size="9" fill="#475569" text-anchor="middle">tap to cycle views</text>
      </svg>
    `;
  }

  private createTokensSvg(analytics: AnalyticsData): string {
    // Calculate totals
    let totalInput = 0;
    let totalOutput = 0;
    for (const tokens of analytics.agentTokens.values()) {
      totalInput += tokens.input;
      totalOutput += tokens.output;
    }

    // Create agent breakdown (top 3)
    const agentLines: string[] = [];
    const sortedAgents = Array.from(analytics.agentTokens.entries())
      .sort((a, b) => b[1].input + b[1].output - (a[1].input + a[1].output))
      .slice(0, 3);

    let y = 82;
    for (const [agentId, tokens] of sortedAgents) {
      const total = tokens.input + tokens.output;
      const name = agentId.charAt(0).toUpperCase() + agentId.slice(1, 6);
      agentLines.push(
        `<text x="20" y="${y}" font-family="monospace" font-size="9" fill="#94a3b8">${name}: ${this.formatTokens(total)}</text>`
      );
      y += 14;
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Title -->
        <text x="72" y="20" font-family="system-ui, sans-serif" font-size="10" fill="#64748b" text-anchor="middle">TOKEN USAGE</text>

        <!-- Input tokens -->
        <text x="36" y="45" font-family="system-ui, sans-serif" font-size="10" fill="#94a3b8" text-anchor="middle">INPUT</text>
        <text x="36" y="62" font-family="monospace" font-size="14" fill="#3b82f6" text-anchor="middle" font-weight="bold">${this.formatTokens(totalInput)}</text>

        <!-- Output tokens -->
        <text x="108" y="45" font-family="system-ui, sans-serif" font-size="10" fill="#94a3b8" text-anchor="middle">OUTPUT</text>
        <text x="108" y="62" font-family="monospace" font-size="14" fill="#10b981" text-anchor="middle" font-weight="bold">${this.formatTokens(totalOutput)}</text>

        <!-- Divider -->
        <line x1="72" y1="38" x2="72" y2="68" stroke="#334155" stroke-width="1"/>

        <!-- Per-agent breakdown -->
        ${agentLines.join("\n")}

        <!-- View indicator -->
        <text x="72" y="134" font-family="system-ui, sans-serif" font-size="9" fill="#475569" text-anchor="middle">TOKENS (2/4)</text>
      </svg>
    `;
  }

  private createTimeSvg(analytics: AnalyticsData): string {
    // Calculate total time
    let totalSeconds = 0;
    for (const seconds of analytics.agentTimes.values()) {
      totalSeconds += seconds;
    }

    // Create agent breakdown (top 3)
    const agentLines: string[] = [];
    const sortedAgents = Array.from(analytics.agentTimes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    let y = 85;
    for (const [agentId, seconds] of sortedAgents) {
      const name = agentId.charAt(0).toUpperCase() + agentId.slice(1, 6);
      agentLines.push(
        `<text x="20" y="${y}" font-family="monospace" font-size="9" fill="#94a3b8">${name}: ${this.formatDuration(seconds)}</text>`
      );
      y += 14;
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Title -->
        <text x="72" y="20" font-family="system-ui, sans-serif" font-size="10" fill="#64748b" text-anchor="middle">SESSION TIME</text>

        <!-- Total time -->
        <text x="72" y="58" font-family="system-ui, sans-serif" font-size="20" fill="#a78bfa" text-anchor="middle" font-weight="bold">${this.formatDuration(totalSeconds)}</text>
        <text x="72" y="72" font-family="system-ui, sans-serif" font-size="10" fill="#94a3b8" text-anchor="middle">total time</text>

        <!-- Per-agent breakdown -->
        ${agentLines.join("\n")}

        <!-- View indicator -->
        <text x="72" y="134" font-family="system-ui, sans-serif" font-size="9" fill="#475569" text-anchor="middle">TIME (3/4)</text>
      </svg>
    `;
  }

  private createToolsSvg(analytics: AnalyticsData): string {
    // Get top 5 tools
    const sortedTools = Array.from(analytics.toolUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const totalUsage = Array.from(analytics.toolUsage.values()).reduce((a, b) => a + b, 0);

    // Create tool list
    const toolLines: string[] = [];
    let y = 42;
    const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

    for (let i = 0; i < sortedTools.length; i++) {
      const [tool, count] = sortedTools[i];
      const pct = totalUsage > 0 ? Math.round((count / totalUsage) * 100) : 0;
      const shortName = tool.length > 10 ? tool.slice(0, 10) + ".." : tool;
      const barWidth = Math.max(2, Math.round((count / (sortedTools[0]?.[1] || 1)) * 60));

      toolLines.push(`
        <rect x="20" y="${y - 8}" width="${barWidth}" height="12" rx="2" fill="${colors[i]}"/>
        <text x="85" y="${y}" font-family="monospace" font-size="9" fill="#e2e8f0">${shortName}</text>
        <text x="130" y="${y}" font-family="monospace" font-size="8" fill="#64748b" text-anchor="end">${pct}%</text>
      `);
      y += 18;
    }

    const noToolsMessage =
      sortedTools.length === 0
        ? `<text x="72" y="72" font-family="system-ui, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">No tool usage data</text>`
        : "";

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Title -->
        <text x="72" y="20" font-family="system-ui, sans-serif" font-size="10" fill="#64748b" text-anchor="middle">TOP TOOLS</text>

        <!-- Tool list -->
        ${toolLines.join("\n")}
        ${noToolsMessage}

        <!-- View indicator -->
        <text x="72" y="134" font-family="system-ui, sans-serif" font-size="9" fill="#475569" text-anchor="middle">TOOLS (4/4)</text>
      </svg>
    `;
  }
}
