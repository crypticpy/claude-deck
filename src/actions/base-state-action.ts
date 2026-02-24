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
 * Base class for Stream Deck actions that react to agent state changes.
 * Handles subscription lifecycle, multi-instance tracking, and active agent resolution.
 *
 * Subclasses only need to implement `renderButton()` to define how a single
 * button instance should look given the current agent state.
 */
export abstract class BaseStateAction extends SingletonAction {
  protected activeActions = new Map<string, WillAppearEvent["action"]>();
  private stateHandler?: (state: AggregatedState) => void;

  /**
   * Subclasses implement this to render a single button instance.
   */
  protected abstract renderButton(
    action: WillAppearEvent["action"],
    state: AgentState | undefined,
  ): Promise<void>;

  /**
   * Get the active agent's state, or undefined if no agent is active.
   */
  protected getActiveAgentState(): AgentState | undefined {
    const id = stateAggregator.getActiveAgentId();
    return id ? stateAggregator.getAgentState(id) : undefined;
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    await this.renderButton(ev.action, this.getActiveAgentState());

    if (!this.stateHandler) {
      this.stateHandler = () => {
        void this.updateAllButtons().catch(() => {
          /* ignore */
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

  private async updateAllButtons(): Promise<void> {
    if (this.activeActions.size === 0) return;
    const state = this.getActiveAgentState();
    await Promise.allSettled(
      [...this.activeActions.values()].map((action) =>
        this.renderButton(action, state),
      ),
    );
  }
}
