import { SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { claudeController, type ClaudeState } from "../utils/claude-controller.js";

/**
 * Activity Display Action - Shows current Claude activity and recent tool calls
 *
 * Displays:
 * - Current status (Idle/Working/Waiting)
 * - Last tool called
 * - Tool call count
 */
export class ActivityDisplayAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.activity-display";

  private updateHandler?: (state: ClaudeState) => void;
  private currentAction?: WillAppearEvent["action"];
  private refreshInterval?: ReturnType<typeof setInterval>;

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.currentAction = ev.action;

    const state = claudeController.getState();
    await this.updateDisplay(ev.action, state);

    this.updateHandler = async (newState: ClaudeState) => {
      if (this.currentAction) {
        await this.updateDisplay(this.currentAction, newState);
      }
    };
    claudeController.on("stateChange", this.updateHandler);

    // Refresh every second for live feel
    this.refreshInterval = setInterval(() => {
      if (this.currentAction) {
        claudeController.refreshState().then(state => {
          this.updateDisplay(this.currentAction!, state);
        });
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

  private async updateDisplay(action: WillAppearEvent["action"], state: ClaudeState): Promise<void> {
    const svg = this.createActivitySvg(state);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private createActivitySvg(state: ClaudeState): string {
    const statusConfigs: Record<string, { color: string; icon: string; pulse: boolean }> = {
      idle: { color: "#6b7280", icon: "○", pulse: false },
      working: { color: "#22c55e", icon: "●", pulse: true },
      waiting: { color: "#eab308", icon: "◐", pulse: true },
      error: { color: "#ef4444", icon: "✕", pulse: false },
    };

    const config = statusConfigs[state.status] || statusConfigs.idle;
    const lastTool = state.lastTool || "—";
    const toolCount = state.toolCallCount || 0;
    const statusText = state.status.charAt(0).toUpperCase() + state.status.slice(1);

    // Animated pulse for active states
    const pulseAnimation = config.pulse ? `
      <animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite"/>
    ` : '';

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#111827" rx="12"/>

        <!-- Status indicator with pulse -->
        <g>
          <circle cx="72" cy="35" r="12" fill="${config.color}">
            ${pulseAnimation}
          </circle>
          <text x="72" y="42" font-family="system-ui, sans-serif" font-size="16" fill="#fff" text-anchor="middle">${config.icon}</text>
        </g>

        <!-- Status text -->
        <text x="72" y="70" font-family="system-ui, sans-serif" font-size="16" fill="${config.color}" text-anchor="middle" font-weight="bold">${statusText}</text>

        <!-- Last tool -->
        <text x="24" y="95" font-family="system-ui, sans-serif" font-size="10" fill="#6b7280">LAST TOOL</text>
        <text x="24" y="112" font-family="system-ui, sans-serif" font-size="12" fill="#d1d5db" font-weight="500">${this.truncate(lastTool, 12)}</text>

        <!-- Tool count -->
        <text x="120" y="95" font-family="system-ui, sans-serif" font-size="10" fill="#6b7280" text-anchor="end">CALLS</text>
        <text x="120" y="112" font-family="system-ui, sans-serif" font-size="14" fill="#d1d5db" text-anchor="end" font-weight="bold">${toolCount}</text>
      </svg>
    `;
  }

  private truncate(str: string, max: number): string {
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + "…";
  }
}
