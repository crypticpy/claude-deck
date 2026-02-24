import {
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { claudeAgent, type AgentState } from "../agents/index.js";

/**
 * Status Action - Displays current Claude Code session status
 */
export class StatusAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.status";

  private updateHandler?: (state: AgentState) => void;
  private activeActions = new Map<string, WillAppearEvent["action"]>();

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);

    // Set initial state
    const state = claudeAgent.getState();
    await this.updateDisplay(ev.action, state);

    // Subscribe to state changes
    if (!this.updateHandler) {
      this.updateHandler = (newState: AgentState) => {
        void this.updateAllWithState(newState).catch(() => {
          // ignore
        });
      };
      claudeAgent.on("stateChange", this.updateHandler);
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    if (this.activeActions.size === 0 && this.updateHandler) {
      claudeAgent.off("stateChange", this.updateHandler);
      this.updateHandler = undefined;
    }
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
    state: AgentState,
  ): Promise<void> {
    // Map status to state index
    const stateIndex =
      state.status === "working" ? 1 : state.status === "waiting" ? 2 : 0;
    if ("setState" in action) {
      await action.setState(stateIndex);
    }

    // Update title based on status
    let title = "Idle";
    if (state.status === "working") {
      title = "Working";
    } else if (state.status === "waiting") {
      title = state.pendingPermission?.tool || "Waiting";
    } else if (state.status === "disconnected") {
      title = "No Session";
    }

    await action.setTitle(title);
  }

  private async updateAllWithState(state: AgentState): Promise<void> {
    if (this.activeActions.size === 0) return;
    await Promise.allSettled(
      [...this.activeActions.values()].map((action) =>
        this.updateDisplay(action, state),
      ),
    );
  }
}
