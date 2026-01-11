import { SingletonAction, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { claudeController } from "../utils/claude-controller.js";

/**
 * New Session Action - Start a fresh Claude Code session
 */
export class NewSessionAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.new-session";

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await ev.action.setTitle("New");
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      await ev.action.setTitle("...");
      await claudeController.startSession();
      await ev.action.showOk();
    } catch (error) {
      console.error("New session failed:", error);
      await ev.action.showAlert();
    } finally {
      await ev.action.setTitle("New");
    }
  }
}
