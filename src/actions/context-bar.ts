import {
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { claudeAgent, type AgentState } from "../agents/index.js";

/**
 * Context Bar Action - Shows context window usage as a visual progress bar
 */
export class ContextBarAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.context-bar";

  private updateHandler?: (state: AgentState) => void;
  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private refreshInterval?: ReturnType<typeof setInterval>;

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    await this.updateDisplay(ev.action);

    if (!this.updateHandler) {
      this.updateHandler = () => {
        void this.updateAll().catch(() => {
          // ignore
        });
      };
      claudeAgent.on("stateChange", this.updateHandler);
    }

    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(() => {
        void this.updateAll().catch(() => {
          // ignore
        });
      }, 2000);
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    if (this.activeActions.size === 0 && this.updateHandler) {
      claudeAgent.off("stateChange", this.updateHandler);
      this.updateHandler = undefined;
    }
    if (this.activeActions.size === 0 && this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
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
    const state = claudeAgent.getState();
    const svg = this.createBarSvg(state);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private getBarColor(percent: number): string {
    if (percent < 50) return "#22c55e"; // Green
    if (percent < 70) return "#eab308"; // Yellow
    if (percent < 85) return "#f97316"; // Orange
    return "#ef4444"; // Red
  }

  private createBarSvg(state: AgentState): string {
    const percent = Math.min(100, Math.round(state.contextPercent ?? 0));
    const contextSize = 200000; // Default context window
    const used = Math.round((percent / 100) * contextSize);
    const total = contextSize;

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
