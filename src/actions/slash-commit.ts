import streamDeck, { action, SingletonAction, type KeyDownEvent } from "@elgato/streamdeck";
import { claudeController } from "../utils/claude-controller.js";

@action({ UUID: "com.anthropic.claude-deck.slash-commit" })
export class SlashCommitAction extends SingletonAction {
  async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    try {
      await claudeController.sendText("/commit");
      streamDeck.logger.info("Sent /commit command");
    } catch (error) {
      streamDeck.logger.error("Failed to send /commit:", error);
    }
  }
}
