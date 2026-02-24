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

    // Map status to state index
    const stateIndex = status === "working" ? 1 : status === "waiting" ? 2 : 0;
    if ("setState" in action) {
      await action.setState(stateIndex);
    }

    // Update title based on status
    let title = "Idle";
    if (status === "working") {
      title = "Working";
    } else if (status === "waiting") {
      title = state?.pendingPermission?.tool || "Waiting";
    } else if (status === "disconnected") {
      title = "No Session";
    }

    await action.setTitle(title);
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
