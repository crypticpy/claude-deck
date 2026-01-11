import { SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { claudeController, type ClaudeState } from "../utils/claude-controller.js";

/**
 * Idle Detector Action - Shows when Claude is waiting for input
 */
export class IdleDetectorAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.idle-detector";

  private currentAction?: WillAppearEvent["action"];
  private refreshInterval?: ReturnType<typeof setInterval>;
  private pulseFrame = 0;

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.currentAction = ev.action;
    await this.updateDisplay(ev.action);

    claudeController.on("stateChange", async () => {
      if (this.currentAction) await this.updateDisplay(this.currentAction);
    });

    this.refreshInterval = setInterval(() => {
      if (this.currentAction) {
        this.pulseFrame = (this.pulseFrame + 1) % 10;
        this.updateDisplay(this.currentAction);
      }
    }, 300);
  }

  override async onWillDisappear(_ev: WillDisappearEvent): Promise<void> {
    this.currentAction = undefined;
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  private async updateDisplay(action: WillAppearEvent["action"]): Promise<void> {
    const state = claudeController.getState();
    const svg = this.createIdleSvg(state);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private createIdleSvg(state: ClaudeState): string {
    const status = state.status || "idle";
    const isWaiting = status === "waiting" || status === "idle";
    const isWorking = status === "working";

    // Calculate idle time
    const lastActivity = state.lastActivityTime ? new Date(state.lastActivityTime).getTime() : Date.now();
    const idleSeconds = Math.floor((Date.now() - lastActivity) / 1000);
    const idleMinutes = Math.floor(idleSeconds / 60);

    // Pulsing animation when waiting
    const pulseOpacity = isWaiting ? 0.3 + Math.sin(this.pulseFrame * 0.6) * 0.3 : 0.2;
    const pulseScale = isWaiting ? 1 + Math.sin(this.pulseFrame * 0.6) * 0.1 : 1;

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

        ${icon === "zzz" ? `
          <text x="72" y="55" font-family="system-ui" font-size="16" fill="${statusColor}" text-anchor="middle">Z</text>
          <text x="80" y="48" font-family="system-ui" font-size="12" fill="${statusColor}" opacity="0.7">z</text>
          <text x="86" y="43" font-family="system-ui" font-size="10" fill="${statusColor}" opacity="0.5">z</text>
        ` : icon === "wait" ? `
          <text x="72" y="68" font-family="system-ui" font-size="28" fill="${statusColor}" text-anchor="middle">?</text>
        ` : icon === "active" ? `
          <circle cx="72" cy="60" r="12" fill="${statusColor}"/>
        ` : `
          <text x="72" y="68" font-family="system-ui" font-size="28" fill="${statusColor}" text-anchor="middle">!</text>
        `}

        <!-- Status -->
        <text x="72" y="105" font-family="system-ui" font-size="12" fill="${statusColor}" text-anchor="middle" font-weight="bold">${statusText}</text>

        <!-- Idle time -->
        ${!isWorking ? `
          <text x="72" y="125" font-family="system-ui" font-size="11" fill="#64748b" text-anchor="middle">${idleDisplay} idle</text>
        ` : `
          <text x="72" y="125" font-family="system-ui" font-size="11" fill="#64748b" text-anchor="middle">Working...</text>
        `}
      </svg>
    `;
  }
}
