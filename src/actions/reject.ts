import { SingletonAction, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { claudeController } from "../utils/claude-controller.js";

/**
 * Reject Action - Declines the pending Claude Code permission request
 */
export class RejectAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.reject";

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await ev.action.setTitle("Reject");
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      await ev.action.setTitle("...");
      const success = await claudeController.reject();

      if (success) {
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("Reject action failed:", error);
      await ev.action.showAlert();
    } finally {
      await ev.action.setTitle("Reject");
    }
  }
}
