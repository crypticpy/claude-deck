import { SingletonAction, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { claudeController } from "../utils/claude-controller.js";

/**
 * Switch Model Action - Cycle through available models (Sonnet/Opus)
 */
export class SwitchModelAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.switch-model";

  private currentModel: "sonnet" | "opus" = "sonnet";

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    const state = claudeController.getState();
    this.currentModel = state.currentModel === "opus" ? "opus" : "sonnet";
    if ("setState" in ev.action) {
      await ev.action.setState(this.currentModel === "opus" ? 1 : 0);
    }
    await ev.action.setTitle(this.currentModel === "opus" ? "Opus" : "Sonnet");
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      const success = await claudeController.switchModel();

      if (success) {
        this.currentModel = this.currentModel === "sonnet" ? "opus" : "sonnet";
        if ("setState" in ev.action) {
          await ev.action.setState(this.currentModel === "opus" ? 1 : 0);
        }
        await ev.action.setTitle(this.currentModel === "opus" ? "Opus" : "Sonnet");
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("Switch model failed:", error);
      await ev.action.showAlert();
    }
  }
}
