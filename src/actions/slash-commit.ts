import streamDeck, { action, SingletonAction } from "@elgato/streamdeck";
import { claudeAgent } from "../agents/index.js";

@action({ UUID: "com.anthropic.claude-deck.slash-commit" })
export class SlashCommitAction extends SingletonAction {
  async onKeyDown(): Promise<void> {
    try {
      await claudeAgent.sendText("/commit");
      streamDeck.logger.info("Sent /commit command");
    } catch (error) {
      streamDeck.logger.error("Failed to send /commit:", error);
    }
  }
}
