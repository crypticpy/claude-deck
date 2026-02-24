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
 * Session Timer Action - Shows how long the current session has been running
 */
export class SessionTimerAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.session-timer";

  private updateHandler?: (state: AggregatedState) => void;
  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private refreshInterval?: ReturnType<typeof setInterval>;

  constructor() {
    super();
  }

  private getActiveAgentState(): AgentState | undefined {
    const activeId = stateAggregator.getActiveAgentId();
    if (activeId) {
      return stateAggregator.getAgentState(activeId);
    }
    return undefined;
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
      stateAggregator.on("stateChange", this.updateHandler);
    }

    // Update every second for live timer
    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(() => {
        void this.updateAll().catch(() => {
          // ignore
        });
      }, 1000);
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    if (this.activeActions.size === 0 && this.updateHandler) {
      stateAggregator.removeListener("stateChange", this.updateHandler);
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
    const state = this.getActiveAgentState();
    const svg = this.createTimerSvg(state);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private formatDuration(ms: number): {
    hours: string;
    minutes: string;
    seconds: string;
  } {
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

  private createTimerSvg(state: AgentState | undefined): string {
    let duration = 0;
    if (state?.sessionStartTime) {
      const start = new Date(state.sessionStartTime).getTime();
      duration = Date.now() - start;
    }

    const { hours, minutes, seconds } = this.formatDuration(duration);
    const isActive = !!state && state.status !== "disconnected";

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
