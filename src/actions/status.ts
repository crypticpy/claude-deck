import { SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { claudeController, type ClaudeState } from "../utils/claude-controller.js";

/**
 * Status Action - Displays current Claude Code session status
 */
export class StatusAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.status";

  private updateHandler?: (state: ClaudeState) => void;
  private currentAction?: WillAppearEvent["action"];

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.currentAction = ev.action;

    // Set initial state
    const state = claudeController.getState();
    await this.updateDisplay(ev.action, state);

    // Subscribe to state changes
    this.updateHandler = async (newState: ClaudeState) => {
      if (this.currentAction) {
        await this.updateDisplay(this.currentAction, newState);
      }
    };
    claudeController.on("stateChange", this.updateHandler);
  }

  override async onWillDisappear(_ev: WillDisappearEvent): Promise<void> {
    this.currentAction = undefined;
    if (this.updateHandler) {
      claudeController.off("stateChange", this.updateHandler);
      this.updateHandler = undefined;
    }
  }

  private async updateDisplay(action: WillAppearEvent["action"], state: ClaudeState): Promise<void> {
    // Map status to state index
    const stateIndex = state.status === "working" ? 1 : state.status === "waiting" ? 2 : 0;
    if ("setState" in action) {
      await action.setState(stateIndex);
    }

    // Update title based on status
    let title = "Idle";
    if (state.status === "working") {
      title = "Working";
    } else if (state.status === "waiting") {
      title = state.pendingPermission?.tool || "Waiting";
    } else if (!state.sessionActive) {
      title = "No Session";
    }

    await action.setTitle(title);
  }
}
