import { SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { claudeController, type ClaudeState } from "../utils/claude-controller.js";

/**
 * Session Timer Action - Shows how long the current session has been running
 */
export class SessionTimerAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.session-timer";

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

    // Update every second for live timer
    this.refreshInterval = setInterval(() => {
      if (this.currentAction) {
        this.updateDisplay(this.currentAction);
      }
    }, 1000);
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
    const svg = this.createTimerSvg(state);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private formatDuration(ms: number): { hours: string; minutes: string; seconds: string } {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return {
      hours: hours.toString().padStart(2, "0"),
      minutes: minutes.toString().padStart(2, "0"),
      seconds: seconds.toString().padStart(2, "0"),
    };
  }

  private createTimerSvg(state: ClaudeState): string {
    let duration = 0;
    if (state.sessionStartTime) {
      const start = new Date(state.sessionStartTime).getTime();
      duration = Date.now() - start;
    }

    const { hours, minutes, seconds } = this.formatDuration(duration);
    const isActive = state.sessionActive;

    // Color based on duration
    let timerColor = "#22c55e"; // Green < 1 hour
    if (duration > 3600000) timerColor = "#eab308"; // Yellow 1-2 hours
    if (duration > 7200000) timerColor = "#f97316"; // Orange 2-4 hours
    if (duration > 14400000) timerColor = "#ef4444"; // Red > 4 hours

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Title -->
        <text x="72" y="28" font-family="system-ui, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">SESSION TIME</text>

        <!-- Timer display -->
        <text x="72" y="72" font-family="monospace" font-size="26" fill="${timerColor}" text-anchor="middle" font-weight="bold">${hours}:${minutes}</text>
        <text x="72" y="95" font-family="monospace" font-size="16" fill="${timerColor}" text-anchor="middle" opacity="0.7">:${seconds}</text>

        <!-- Status indicator -->
        <circle cx="72" cy="120" r="6" fill="${isActive ? timerColor : "#475569"}"/>
        <text x="72" y="136" font-family="system-ui, sans-serif" font-size="9" fill="#64748b" text-anchor="middle">${isActive ? "ACTIVE" : "IDLE"}</text>
      </svg>
    `;
  }
}
