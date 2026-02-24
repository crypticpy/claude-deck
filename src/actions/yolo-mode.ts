import {
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import {
  claudeAgent,
  stateAggregator,
  type AgentState,
} from "../agents/index.js";

/**
 * YOLO Mode Action - Toggle auto-approve mode (bypass all permissions)
 */
export class YoloModeAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.yolo-mode";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private updateHandler?: (state: AgentState) => void;

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);

    const state = claudeAgent.getState();
    await this.updateDisplay(ev.action, state);

    if (!this.updateHandler) {
      this.updateHandler = (newState: AgentState) => {
        void this.updateAllWithState(newState).catch(() => {
          // ignore
        });
      };
      claudeAgent.on("stateChange", this.updateHandler);
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      const success = await stateAggregator.cycleMode();

      if (success) {
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("YOLO mode toggle failed:", error);
      await ev.action.showAlert();
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    if (this.activeActions.size === 0 && this.updateHandler) {
      claudeAgent.off("stateChange", this.updateHandler);
      this.updateHandler = undefined;
    }
  }

  private async updateAllWithState(state: AgentState): Promise<void> {
    if (this.activeActions.size === 0) return;
    await Promise.allSettled(
      [...this.activeActions.values()].map((action) =>
        this.updateDisplay(action, state),
      ),
    );
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
    state: AgentState,
  ): Promise<void> {
    const isYoloOn = state.mode === "bypassPermissions";
    if ("setState" in action) {
      await action.setState(isYoloOn ? 1 : 0);
    }
  }
}
