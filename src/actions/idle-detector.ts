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
 * Idle Detector Action - Shows when Claude is waiting for input
 */
export class IdleDetectorAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.idle-detector";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private updateHandler?: (state: AggregatedState) => void;
  private refreshInterval?: ReturnType<typeof setInterval>;
  private pulseFrame = 0;
  private currentStatus: string = "disconnected";

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
        const agentState = this.getActiveAgentState();
        const newStatus = agentState?.status || "disconnected";
        if (newStatus !== this.currentStatus) {
          this.currentStatus = newStatus;
          this.adjustInterval();
        }
        void this.updateAll().catch(() => {
          // ignore
        });
      };
      stateAggregator.on("stateChange", this.updateHandler);
    }

    this.currentStatus = this.getActiveAgentState()?.status || "disconnected";
    this.adjustInterval();
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    if (this.activeActions.size === 0 && this.updateHandler) {
      stateAggregator.removeListener("stateChange", this.updateHandler);
      this.updateHandler = undefined;
    }
    if (this.activeActions.size === 0) {
      this.clearInterval();
    }
  }

  private getDesiredInterval(): number {
    // Fast pulse when waiting for user input
    if (this.currentStatus === "waiting") return 300;
    // Slow update for idle time display and other states
    return 2000;
  }

  private currentIntervalMs = 0;

  private adjustInterval(): void {
    const desired = this.getDesiredInterval();
    if (desired === this.currentIntervalMs && this.refreshInterval) return;
    this.clearInterval();
    this.currentIntervalMs = desired;
    this.refreshInterval = setInterval(() => {
      if (this.activeActions.size === 0) return;
      this.pulseFrame = (this.pulseFrame + 1) % 10;
      void this.updateAll().catch(() => {
        // ignore
      });
    }, desired);
  }

  private clearInterval(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
      this.currentIntervalMs = 0;
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
    const svg = this.createIdleSvg(state);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private createIdleSvg(state: AgentState | undefined): string {
    const status = state?.status || "idle";
    const isWaiting = status === "waiting" || status === "idle";
    const isWorking = status === "working";

    // Calculate idle time
    const lastActivity = state?.lastActivityTime
      ? new Date(state.lastActivityTime).getTime()
      : Date.now();
    const idleSeconds = Math.floor((Date.now() - lastActivity) / 1000);
    const idleMinutes = Math.floor(idleSeconds / 60);

    // Pulsing animation when waiting
    const pulseOpacity = isWaiting
      ? 0.3 + Math.sin(this.pulseFrame * 0.6) * 0.3
      : 0.2;
    const pulseScale = isWaiting
      ? 1 + Math.sin(this.pulseFrame * 0.6) * 0.1
      : 1;

    let statusColor = "#64748b"; // Gray for idle
    let statusText = "Idle";
    let icon = "zzz";

    if (isWorking) {
      statusColor = "#22c55e";
      statusText = "Active";
      icon = "active";
    } else if (status === "waiting") {
      statusColor = "#eab308";
      statusText = "Waiting";
      icon = "wait";
    } else if (status === "error") {
      statusColor = "#ef4444";
      statusText = "Error";
      icon = "error";
    }

    const idleDisplay = idleMinutes > 0 ? `${idleMinutes}m` : `${idleSeconds}s`;

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Pulse ring -->
        <circle cx="72" cy="60" r="${40 * pulseScale}" fill="${statusColor}" opacity="${pulseOpacity}"/>

        <!-- Main circle -->
        <circle cx="72" cy="60" r="30" fill="${statusColor}" opacity="0.3"/>
        <circle cx="72" cy="60" r="30" fill="none" stroke="${statusColor}" stroke-width="3"/>

        ${
          icon === "zzz"
            ? `
          <text x="72" y="55" font-family="system-ui, sans-serif" font-size="16" fill="${statusColor}" text-anchor="middle">Z</text>
          <text x="80" y="48" font-family="system-ui, sans-serif" font-size="12" fill="${statusColor}" opacity="0.7">z</text>
          <text x="86" y="43" font-family="system-ui, sans-serif" font-size="10" fill="${statusColor}" opacity="0.5">z</text>
        `
            : icon === "wait"
              ? `
          <text x="72" y="68" font-family="system-ui, sans-serif" font-size="28" fill="${statusColor}" text-anchor="middle">?</text>
        `
              : icon === "active"
                ? `
          <circle cx="72" cy="60" r="12" fill="${statusColor}"/>
        `
                : `
          <text x="72" y="68" font-family="system-ui, sans-serif" font-size="28" fill="${statusColor}" text-anchor="middle">!</text>
        `
        }

        <!-- Status -->
        <text x="72" y="105" font-family="system-ui, sans-serif" font-size="12" fill="${statusColor}" text-anchor="middle" font-weight="bold">${statusText}</text>

        <!-- Idle time -->
        ${
          !isWorking
            ? `
          <text x="72" y="125" font-family="system-ui, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">${idleDisplay} idle</text>
        `
            : `
          <text x="72" y="125" font-family="system-ui, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">Working...</text>
        `
        }
      </svg>
    `;
  }
}
