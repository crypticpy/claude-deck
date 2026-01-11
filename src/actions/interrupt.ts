import { SingletonAction, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { claudeController } from "../utils/claude-controller.js";

/**
 * Interrupt Action - Sends Ctrl+C to stop current Claude Code operation
 */
export class InterruptAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.interrupt";

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await ev.action.setTitle("Stop");
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      await ev.action.setTitle("...");
      const success = await claudeController.interrupt();

      if (success) {
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("Interrupt action failed:", error);
      await ev.action.showAlert();
    } finally {
      await ev.action.setTitle("Stop");
    }
  }
}
