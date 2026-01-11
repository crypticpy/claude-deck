import { SingletonAction, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { claudeController } from "../utils/claude-controller.js";

/**
 * Approve Action - Accepts the pending Claude Code permission request
 */
export class ApproveAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.approve";

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await ev.action.setTitle("Approve");
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      await ev.action.setTitle("...");
      const success = await claudeController.approve();

      if (success) {
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("Approve action failed:", error);
      await ev.action.showAlert();
    } finally {
      await ev.action.setTitle("Approve");
    }
  }
}
