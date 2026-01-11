import streamDeck, { action, SingletonAction, type KeyDownEvent } from "@elgato/streamdeck";
import { claudeController } from "../utils/claude-controller.js";

@action({ UUID: "com.anthropic.claude-deck.slash-review" })
export class SlashReviewAction extends SingletonAction {
  async onKeyDown(_ev: KeyDownEvent): Promise<void> {
    try {
      await claudeController.sendText("/review");
      streamDeck.logger.info("Sent /review command");
    } catch (error) {
      streamDeck.logger.error("Failed to send /review:", error);
    }
  }
}
