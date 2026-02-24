import {
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { claudeAgent, type AgentState } from "../agents/index.js";

/**
 * Tool Breakdown Action - Pie chart showing tool usage distribution
 */
export class ToolBreakdownAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.tool-breakdown";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private updateHandler?: (state: AgentState) => void;
  private refreshInterval?: ReturnType<typeof setInterval>;

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
      }, 3000);
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
    const svg = this.createPieChartSvg(state);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private createPieChartSvg(state: AgentState): string {
    // Tool counts from state (populated by hooks if available)
    const tools: Record<string, number> =
      state.toolUsage && Object.keys(state.toolUsage).length > 0
        ? state.toolUsage
        : {};
    const total = Object.values(tools).reduce((a, b) => a + b, 0) || 1;

    const colors: Record<string, string> = {
      Bash: "#22c55e",
      Read: "#3b82f6",
      Edit: "#f59e0b",
      Write: "#ef4444",
      Other: "#8b5cf6",
    };

    let paths = "";
    let startAngle = 0;
    const cx = 72,
      cy = 55,
      r = 35;

    for (const [tool, count] of Object.entries(tools)) {
      const pct = (count as number) / total;
      const angle = pct * 360;
      const endAngle = startAngle + angle;

      const x1 = cx + r * Math.cos(((startAngle - 90) * Math.PI) / 180);
      const y1 = cy + r * Math.sin(((startAngle - 90) * Math.PI) / 180);
      const x2 = cx + r * Math.cos(((endAngle - 90) * Math.PI) / 180);
      const y2 = cy + r * Math.sin(((endAngle - 90) * Math.PI) / 180);

      const largeArc = angle > 180 ? 1 : 0;
      const color = colors[tool] || colors.Other;

      if (pct > 0.01) {
        paths += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z" fill="${color}"/>`;
      }
      startAngle = endAngle;
    }

    const toolCount = state.toolUsage
      ? Object.values(state.toolUsage).reduce((sum, count) => sum + count, 0)
      : 0;

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>
        <text x="72" y="18" font-family="system-ui" font-size="10" fill="#64748b" text-anchor="middle">TOOLS</text>
        ${paths || `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#1e293b"/>`}
        <circle cx="${cx}" cy="${cy}" r="18" fill="#0f172a"/>
        <text x="${cx}" y="${cy + 5}" font-family="system-ui" font-size="14" fill="#e2e8f0" text-anchor="middle" font-weight="bold">${toolCount}</text>
        <text x="25" y="110" font-size="8" fill="#22c55e">Bash</text>
        <text x="55" y="110" font-size="8" fill="#3b82f6">Read</text>
        <text x="85" y="110" font-size="8" fill="#f59e0b">Edit</text>
        <text x="115" y="110" font-size="8" fill="#ef4444">Write</text>
      </svg>
    `;
  }
}
