import { SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { claudeController, type ClaudeState } from "../utils/claude-controller.js";

/**
 * Context Percent Action - Shows context window usage as a large percentage
 */
export class ContextPercentAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.context-percent";

  private updateHandler?: (state: ClaudeState) => void;
  private currentAction?: WillAppearEvent["action"];
  private refreshInterval?: ReturnType<typeof setInterval>;

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.currentAction = ev.action;

    await this.updateDisplay(ev.action);

    this.updateHandler = async () => {
      if (this.currentAction) {
        await this.updateDisplay(this.currentAction);
      }
    };
    claudeController.on("stateChange", this.updateHandler);

    this.refreshInterval = setInterval(() => {
      if (this.currentAction) {
        this.updateDisplay(this.currentAction);
      }
    }, 2000);
  }

  override async onWillDisappear(_ev: WillDisappearEvent): Promise<void> {
    this.currentAction = undefined;
    if (this.updateHandler) {
      claudeController.off("stateChange", this.updateHandler);
      this.updateHandler = undefined;
    }
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }

  private async updateDisplay(action: WillAppearEvent["action"]): Promise<void> {
    const state = claudeController.getState();
    const svg = this.createPercentSvg(state);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private getColor(percent: number): string {
    if (percent < 50) return "#22c55e"; // Green
    if (percent < 70) return "#eab308"; // Yellow
    if (percent < 85) return "#f97316"; // Orange
    return "#ef4444"; // Red
  }

  private createPercentSvg(state: ClaudeState): string {
    const percent = state.contextPercent || 0;
    const color = this.getColor(percent);

    // Create a circular progress indicator
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (percent / 100) * circumference;

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Background circle -->
        <circle cx="72" cy="72" r="${radius}" fill="none" stroke="#1e293b" stroke-width="10"/>

        <!-- Progress circle -->
        <circle cx="72" cy="72" r="${radius}" fill="none" stroke="${color}" stroke-width="10"
          stroke-linecap="round"
          stroke-dasharray="${circumference}"
          stroke-dashoffset="${strokeDashoffset}"
          transform="rotate(-90 72 72)"/>

        <!-- Percentage text -->
        <text x="72" y="68" font-family="system-ui, sans-serif" font-size="32" fill="${color}" text-anchor="middle" font-weight="bold">${Math.round(percent)}</text>
        <text x="72" y="90" font-family="system-ui, sans-serif" font-size="14" fill="#64748b" text-anchor="middle">%</text>
      </svg>
    `;
  }
}
