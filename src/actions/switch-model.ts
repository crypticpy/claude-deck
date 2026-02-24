import { SingletonAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { stateAggregator, type AggregatedState } from "../agents/index.js";

/**
 * Switch Model Action - Cycle through available models for the active agent
 *
 * This action works with any agent that supports model switching.
 * Displays the current model from the active agent's state.
 */
export class SwitchModelAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.switch-model";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private updateHandler?: (state: AggregatedState) => void;

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    await this.updateDisplay(ev.action);

    if (!this.updateHandler) {
      this.updateHandler = () => {
        void this.updateAllDisplays().catch(() => {});
      };
      stateAggregator.on("stateChange", this.updateHandler);
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    if (this.activeActions.size === 0 && this.updateHandler) {
      stateAggregator.off("stateChange", this.updateHandler);
      this.updateHandler = undefined;
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      const success = await stateAggregator.cycleModel();

      if (success) {
        await ev.action.showOk();
        // Update display after model switch
        await this.updateDisplay(ev.action);
      } else {
        // Agent might not support model switching
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("Switch model failed:", error);
      await ev.action.showAlert();
    }
  }

  private async updateAllDisplays(): Promise<void> {
    if (this.activeActions.size === 0) return;
    await Promise.allSettled([...this.activeActions.values()].map((action) => this.updateDisplay(action)));
  }

  private async updateDisplay(action: WillAppearEvent["action"]): Promise<void> {
    const activeAgent = stateAggregator.getActiveAgent();
    const agentState = activeAgent ? stateAggregator.getAgentState(activeAgent.id) : null;

    const model = agentState?.model ?? "Unknown";
    const displayName = this.formatModelName(model);

    if ("setState" in action) {
      await action.setState(model.toLowerCase().includes("opus") ? 1 : 0);
    }
    await action.setTitle(displayName);
  }

  private formatModelName(model: string): string {
    const lower = model.toLowerCase();
    if (lower.includes("opus")) return "Opus";
    if (lower.includes("sonnet")) return "Sonnet";
    if (lower.includes("haiku")) return "Haiku";
    if (lower.includes("gpt-4")) return "GPT-4";
    if (lower.includes("gpt-5")) return "GPT-5";
    if (lower.includes("gemini")) return "Gemini";
    // Return first word capitalized if unknown
    return model.split(/[-_]/)[0].charAt(0).toUpperCase() + model.split(/[-_]/)[0].slice(1);
  }
}
