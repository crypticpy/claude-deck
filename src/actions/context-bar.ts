import { SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { claudeController, type ClaudeState } from "../utils/claude-controller.js";

/**
 * Context Bar Action - Shows context window usage as a visual progress bar
 */
export class ContextBarAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.context-bar";

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
    const svg = this.createBarSvg(state);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private getBarColor(percent: number): string {
    if (percent < 50) return "#22c55e"; // Green
    if (percent < 70) return "#eab308"; // Yellow
    if (percent < 85) return "#f97316"; // Orange
    return "#ef4444"; // Red
  }

  private createBarSvg(state: ClaudeState): string {
    const percent = state.contextPercent || 0;
    const used = state.contextUsed || state.tokens?.input || 0;
    const total = state.contextSize || 200000;

    const barColor = this.getBarColor(percent);
    const barWidth = Math.min(100, percent); // Cap at 100%

    // Format numbers
    const usedK = Math.round(used / 1000);
    const totalK = Math.round(total / 1000);

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Title -->
        <text x="72" y="28" font-family="system-ui, sans-serif" font-size="12" fill="#64748b" text-anchor="middle">CONTEXT</text>

        <!-- Token count -->
        <text x="72" y="52" font-family="system-ui, sans-serif" font-size="16" fill="#e2e8f0" text-anchor="middle" font-weight="bold">${usedK}K / ${totalK}K</text>

        <!-- Progress bar background -->
        <rect x="16" y="68" width="112" height="24" rx="6" fill="#1e293b"/>

        <!-- Progress bar fill -->
        <rect x="16" y="68" width="${(barWidth / 100) * 112}" height="24" rx="6" fill="${barColor}"/>

        <!-- Percentage inside bar -->
        <text x="72" y="85" font-family="system-ui, sans-serif" font-size="14" fill="#ffffff" text-anchor="middle" font-weight="bold">${Math.round(percent)}%</text>

        <!-- Remaining capacity -->
        <text x="72" y="115" font-family="system-ui, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">~${Math.round((total - used) / 1000)}K remaining</text>
      </svg>
    `;
  }
}
