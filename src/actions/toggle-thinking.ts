import {
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { stateAggregator } from "../agents/index.js";

/**
 * Toggle Thinking Action - Enable/disable extended thinking mode
 */
export class ToggleThinkingAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.toggle-thinking";

  private isThinkingOn = false;

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    if ("setState" in ev.action) {
      await ev.action.setState(this.isThinkingOn ? 1 : 0);
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      const agent = stateAggregator.getActiveAgent();
      const success = agent ? await agent.toggleThinking() : false;

      if (success) {
        this.isThinkingOn = !this.isThinkingOn;
        if ("setState" in ev.action) {
          await ev.action.setState(this.isThinkingOn ? 1 : 0);
        }
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("Toggle thinking failed:", error);
      await ev.action.showAlert();
    }
  }
}
