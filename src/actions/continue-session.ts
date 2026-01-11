import { SingletonAction, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { claudeController } from "../utils/claude-controller.js";

/**
 * Continue Session Action - Resume the most recent Claude Code session
 */
export class ContinueSessionAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.continue-session";

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await ev.action.setTitle("Cont");
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      await ev.action.setTitle("...");
      await claudeController.continueSession();
      await ev.action.showOk();
    } catch (error) {
      console.error("Continue session failed:", error);
      await ev.action.showAlert();
    } finally {
      await ev.action.setTitle("Cont");
    }
  }
}
