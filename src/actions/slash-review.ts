import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import { claudeAgent } from "../agents/index.js";

@action({ UUID: "com.anthropic.claude-deck.slash-review" })
export class SlashReviewAction extends SingletonAction {
  async onKeyDown(): Promise<void> {
    try {
      await claudeAgent.sendText("/review");
      streamDeck.logger.info("Sent /review command");
    } catch (error) {
      streamDeck.logger.error("Failed to send /review:", error);
    }
  }
}
