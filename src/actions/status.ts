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
 * Status Action - Displays current Claude Code session status
 *
 * Uses shape-based icons alongside color to ensure accessibility
 * for color-blind users (red-green differentiation):
 *   idle:         gray   + circle
 *   working:      green  + play triangle
 *   waiting:      amber  + pause bars
 *   error:        red    + exclamation triangle
 *   disconnected: gray   + slash-through circle
 */
export class StatusAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.status";

  private stateHandler?: (state: AggregatedState) => void;
  private activeActions = new Map<string, WillAppearEvent["action"]>();

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);

    // Set initial state
    const state = this.getActiveAgentState();
    await this.updateDisplay(ev.action, state);

    // Subscribe to state changes
    if (!this.stateHandler) {
      this.stateHandler = () => {
        void this.updateAllDisplays().catch(() => {
          // ignore
        });
      };
      stateAggregator.on("stateChange", this.stateHandler);
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    if (this.activeActions.size === 0 && this.stateHandler) {
      stateAggregator.removeListener("stateChange", this.stateHandler);
      this.stateHandler = undefined;
    }
  }

  private getActiveAgentState(): AgentState | undefined {
    const activeId = stateAggregator.getActiveAgentId();
    if (activeId) {
      return stateAggregator.getAgentState(activeId);
    }
    return undefined;
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
    state: AgentState | undefined,
  ): Promise<void> {
    const status = state?.status ?? "disconnected";

    // Build a custom SVG with shape-based differentiation
    const svg = this.createStatusSvg(status, state);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);

    // Update title based on status
    let title = "Idle";
    if (status === "working") {
      title = "Working";
    } else if (status === "waiting") {
      title = state?.pendingPermission?.tool || "Waiting";
    } else if (status === "error") {
      title = "Error";
    } else if (status === "disconnected") {
      title = "No Session";
    }

    await action.setTitle(title);
  }

  private createStatusSvg(
    status: string,
    _state: AgentState | undefined,
  ): string {
    const configs: Record<string, { color: string; label: string }> = {
      idle: { color: "#94a3b8", label: "IDLE" },
      working: { color: "#22c55e", label: "WORKING" },
      waiting: { color: "#eab308", label: "WAITING" },
      error: { color: "#ef4444", label: "ERROR" },
      disconnected: { color: "#64748b", label: "OFFLINE" },
    };

    const config = configs[status] || configs.disconnected;
    const { color, label } = config;

    // Each status gets a unique shape icon inside a circle
    let shapeIcon: string;
    switch (status) {
      case "idle":
        // Filled circle (dot)
        shapeIcon = `<circle cx="72" cy="62" r="14" fill="${color}"/>`;
        break;

      case "working":
        // Play triangle pointing right
        shapeIcon = `<polygon points="62,48 62,76 88,62" fill="${color}"/>`;
        break;

      case "waiting":
        // Pause icon (two vertical bars)
        shapeIcon = `
          <rect x="60" y="48" width="8" height="28" rx="2" fill="${color}"/>
          <rect x="76" y="48" width="8" height="28" rx="2" fill="${color}"/>
        `;
        break;

      case "error":
        // Warning triangle with exclamation mark
        shapeIcon = `
          <polygon points="72,42 94,80 50,80" fill="none" stroke="${color}" stroke-width="3.5" stroke-linejoin="round"/>
          <line x1="72" y1="54" x2="72" y2="68" stroke="${color}" stroke-width="3.5" stroke-linecap="round"/>
          <circle cx="72" cy="74" r="2" fill="${color}"/>
        `;
        break;

      case "disconnected":
      default:
        // Circle with a diagonal slash through it
        shapeIcon = `
          <circle cx="72" cy="62" r="18" fill="none" stroke="${color}" stroke-width="3"/>
          <line x1="59" y1="75" x2="85" y2="49" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
        `;
        break;
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Outer ring -->
        <circle cx="72" cy="62" r="34" fill="none" stroke="${color}" stroke-width="3" opacity="0.35"/>

        <!-- Shape icon -->
        ${shapeIcon}

        <!-- Status label -->
        <text x="72" y="116" font-family="system-ui, sans-serif" font-size="14" fill="${color}" text-anchor="middle" font-weight="bold">${label}</text>
      </svg>
    `;
  }

  private async updateAllDisplays(): Promise<void> {
    if (this.activeActions.size === 0) return;
    const agentState = this.getActiveAgentState();
    await Promise.allSettled(
      [...this.activeActions.values()].map((action) =>
        this.updateDisplay(action, agentState),
      ),
    );
  }
}
