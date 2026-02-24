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

/**
 * Context Bar Action - Shows context window usage as a visual progress bar
 */
export class ContextBarAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.context-bar";

  private stateHandler?: (state: AggregatedState) => void;
  private activeActions = new Map<string, WillAppearEvent["action"]>();
  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    await this.updateDisplay(ev.action);

    if (!this.stateHandler) {
      this.stateHandler = () => {
        void this.updateAll().catch(() => {
          // ignore
        });
      };
      stateAggregator.on("stateChange", this.stateHandler);
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    if (this.activeActions.size === 0 && this.stateHandler) {
      stateAggregator.removeListener("stateChange", this.stateHandler);
      this.stateHandler = undefined;
    }
  }

  private getActiveAgentState(): AgentState | undefined {
    const activeId = stateAggregator.getActiveAgentId();
    if (activeId) {
      return stateAggregator.getAgentState(activeId);
    }
    return undefined;
  }

  private async updateAll(): Promise<void> {
    if (this.activeActions.size === 0) return;
    await Promise.allSettled(
      [...this.activeActions.values()].map((action) =>
        this.updateDisplay(action),
      ),
    );
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
  ): Promise<void> {
    const state = this.getActiveAgentState();
    const svg = this.createBarSvg(state);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private getBarColor(percent: number): string {
    if (percent < 50) return "#22c55e"; // Green
    if (percent < 70) return "#eab308"; // Yellow
    if (percent < 85) return "#f97316"; // Orange
    return "#ef4444"; // Red
  }

  private createBarSvg(state: AgentState | undefined): string {
    const total = state?.contextSize || 200000;
    const used = state?.contextUsed || 0;
    const percent =
      state?.contextPercent != null
        ? Math.min(100, Math.round(state.contextPercent))
        : total > 0
          ? Math.min(100, Math.round((used / total) * 100))
          : 0;

    const barColor = this.getBarColor(percent);
    const barWidth = Math.min(100, percent);

    const usedK = Math.round(used / 1000);
    const totalK = Math.round(total / 1000);

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>
        <text x="72" y="28" font-family="system-ui, sans-serif" font-size="12" fill="#64748b" text-anchor="middle">CONTEXT</text>
        <text x="72" y="52" font-family="system-ui, sans-serif" font-size="16" fill="#e2e8f0" text-anchor="middle" font-weight="bold">${usedK}K / ${totalK}K</text>
        <rect x="16" y="68" width="112" height="24" rx="6" fill="#1e293b"/>
        <rect x="16" y="68" width="${(barWidth / 100) * 112}" height="24" rx="6" fill="${barColor}"/>
        <text x="72" y="85" font-family="system-ui, sans-serif" font-size="14" fill="#ffffff" text-anchor="middle" font-weight="bold">${percent}%</text>
        <text x="72" y="115" font-family="system-ui, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">~${Math.round((total - used) / 1000)}K remaining</text>
      </svg>
    `;
  }
}
