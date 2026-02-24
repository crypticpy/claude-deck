import {
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import {
  stateAggregator,
  type AgentState,
  type AggregatedState,
} from "../agents/index.js";
import { escapeXml, svgToDataUri } from "../utils/svg-utils.js";

/**
 * Activity Display Action - Shows current Claude activity and recent tool calls
 *
 * Displays:
 * - Current status (Idle/Working/Waiting)
 * - Last tool called
 * - Tool call count
 */
export class ActivityDisplayAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.activity-display";

  private updateHandler?: (state: AggregatedState) => void;
  private activeActions = new Map<string, WillAppearEvent["action"]>();
  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);

    const state = this.getActiveAgentState();
    await this.updateDisplay(ev.action, state);

    if (!this.updateHandler) {
      this.updateHandler = () => {
        const agentState = this.getActiveAgentState();
        void this.updateAllWithState(agentState).catch(() => {
          // ignore
        });
      };
      stateAggregator.on("stateChange", this.updateHandler);
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);

    if (this.activeActions.size === 0 && this.updateHandler) {
      stateAggregator.removeListener("stateChange", this.updateHandler);
      this.updateHandler = undefined;
    }
  }

  private getActiveAgentState(): AgentState | undefined {
    const id = stateAggregator.getActiveAgentId();
    return id ? stateAggregator.getAgentState(id) : undefined;
  }

  private async updateAllWithState(
    state: AgentState | undefined,
  ): Promise<void> {
    if (this.activeActions.size === 0) return;
    await Promise.allSettled(
      [...this.activeActions.values()].map((action) =>
        this.updateDisplay(action, state),
      ),
    );
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
    state: AgentState | undefined,
  ): Promise<void> {
    const svg = this.createActivitySvg(state);
    await action.setImage(svgToDataUri(svg));
  }

  private createActivitySvg(state: AgentState | undefined): string {
    const statusConfigs: Record<
      string,
      { color: string; icon: string; pulse: boolean }
    > = {
      idle: { color: "#6b7280", icon: "○", pulse: false },
      working: { color: "#22c55e", icon: "●", pulse: true },
      waiting: { color: "#eab308", icon: "◐", pulse: true },
      error: { color: "#ef4444", icon: "✕", pulse: false },
    };

    const config = statusConfigs[state?.status ?? "idle"] || statusConfigs.idle;
    const toolEntries = state?.toolUsage ? Object.entries(state.toolUsage) : [];
    const lastTool =
      toolEntries.length > 0 ? toolEntries[toolEntries.length - 1][0] : "—";
    const toolCount = toolEntries.reduce((sum, [, count]) => sum + count, 0);
    const status = state?.status ?? "idle";
    const statusText = status.charAt(0).toUpperCase() + status.slice(1);

    // Animated pulse for active states
    const pulseAnimation = config.pulse
      ? `
      <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite"/>
    `
      : "";

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Status indicator with pulse -->
        <g>
          <circle cx="72" cy="35" r="12" fill="${config.color}">
            ${pulseAnimation}
          </circle>
          <text x="72" y="42" font-family="system-ui, sans-serif" font-size="16" fill="#fff" text-anchor="middle">${config.icon}</text>
        </g>

        <!-- Status text -->
        <text x="72" y="70" font-family="system-ui, sans-serif" font-size="16" fill="${config.color}" text-anchor="middle" font-weight="bold">${escapeXml(statusText)}</text>

        <!-- Last tool -->
        <text x="24" y="95" font-family="system-ui, sans-serif" font-size="10" fill="#6b7280">LAST TOOL</text>
        <text x="24" y="112" font-family="system-ui, sans-serif" font-size="12" fill="#d1d5db" font-weight="500">${escapeXml(this.truncate(lastTool, 12))}</text>

        <!-- Tool count -->
        <text x="120" y="95" font-family="system-ui, sans-serif" font-size="10" fill="#6b7280" text-anchor="end">CALLS</text>
        <text x="120" y="112" font-family="system-ui, sans-serif" font-size="14" fill="#d1d5db" text-anchor="end" font-weight="bold">${toolCount}</text>
      </svg>
    `;
  }

  private truncate(str: string, max: number): string {
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + "…";
  }
}
