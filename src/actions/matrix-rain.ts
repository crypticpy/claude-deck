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
import { svgToDataUri } from "../utils/svg-utils.js";

/**
 * Matrix Rain Action - Animated matrix effect when Claude is working
 */
export class MatrixRainAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.matrix-rain";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private updateHandler?: (state: AggregatedState) => void;
  private refreshInterval?: ReturnType<typeof setInterval>;
  private drops: number[] = [];
  private frame = 0;
  private currentStatus: string = "disconnected";

  constructor() {
    super();
    // Initialize rain drops at random positions
    for (let i = 0; i < 12; i++) {
      this.drops.push(Math.random() * 144);
    }
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    await this.updateDisplay(ev.action);

    if (!this.updateHandler) {
      this.updateHandler = () => {
        const agentState = this.getActiveAgentState();
        const newStatus = agentState?.status || "disconnected";
        const wasWorking = this.currentStatus === "working";
        const isWorking = newStatus === "working";
        this.currentStatus = newStatus;

        // Start/stop fast timer based on status transitions
        if (isWorking && !wasWorking) {
          this.startFastTimer();
        } else if (!isWorking && wasWorking) {
          this.stopFastTimer();
        }

        void this.updateAll().catch(() => {
          // ignore
        });
      };
      stateAggregator.on("stateChange", this.updateHandler);
    }

    // Only start fast timer if currently working
    this.currentStatus = this.getActiveAgentState()?.status || "disconnected";
    if (this.currentStatus === "working") {
      this.startFastTimer();
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    if (this.activeActions.size === 0 && this.updateHandler) {
      stateAggregator.removeListener("stateChange", this.updateHandler);
      this.updateHandler = undefined;
    }
    if (this.activeActions.size === 0) {
      this.stopFastTimer();
    }
  }

  private startFastTimer(): void {
    if (this.refreshInterval) return;
    this.refreshInterval = setInterval(() => {
      if (this.activeActions.size === 0) return;
      this.frame++;
      for (let i = 0; i < this.drops.length; i++) {
        this.drops[i] += 8 + Math.random() * 4;
        if (this.drops[i] > 144) this.drops[i] = -20;
      }
      void this.updateAll().catch(() => {
        // ignore
      });
    }, 100);
  }

  private stopFastTimer(): void {
    if (this.refreshInterval) {
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

  private getActiveAgentState(): AgentState | undefined {
    const id = stateAggregator.getActiveAgentId();
    return id ? stateAggregator.getAgentState(id) : undefined;
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
  ): Promise<void> {
    const state = this.getActiveAgentState();
    const svg = this.createMatrixSvg(state);
    await action.setImage(svgToDataUri(svg));
  }

  private createMatrixSvg(state: AgentState | undefined): string {
    const isWorking = state?.status === "working";
    const chars =
      "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン01";

    let rainDrops = "";

    if (isWorking) {
      for (let i = 0; i < this.drops.length; i++) {
        const x = 12 + i * 10;
        const y = this.drops[i];
        const char = chars[Math.floor(Math.random() * chars.length)];
        const opacity = Math.max(0, 1 - y / 144);

        // Trail effect
        for (let j = 0; j < 5; j++) {
          const trailY = y - j * 12;
          const trailOpacity = opacity * (1 - j * 0.2);
          if (trailY > 0 && trailY < 144) {
            const trailChar = chars[Math.floor(Math.random() * chars.length)];
            rainDrops += `<text x="${x}" y="${trailY}" font-family="monospace" font-size="10" fill="#22c55e" opacity="${trailOpacity}">${trailChar}</text>`;
          }
        }

        // Bright leading character
        if (y > 0 && y < 144) {
          rainDrops += `<text x="${x}" y="${y}" font-family="monospace" font-size="10" fill="#4ade80" font-weight="bold">${char}</text>`;
        }
      }
    }

    const statusText = isWorking ? "PROCESSING" : "STANDBY";
    const statusColor = isWorking ? "#22c55e" : "#64748b";

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#000000" rx="12"/>
        ${rainDrops}
        <!-- Overlay gradient for depth -->
        <rect width="144" height="144" fill="url(#fade)" rx="12"/>
        <defs>
          <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#000" stop-opacity="0"/>
            <stop offset="80%" stop-color="#000" stop-opacity="0"/>
            <stop offset="100%" stop-color="#000" stop-opacity="1"/>
          </linearGradient>
        </defs>
        <text x="72" y="130" font-family="monospace" font-size="10" fill="${statusColor}" text-anchor="middle">${statusText}</text>
      </svg>
    `;
  }
}
