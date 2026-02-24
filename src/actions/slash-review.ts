import streamDeck, {
  SingletonAction,
  type KeyDownEvent,
} from "@elgato/streamdeck";
import { stateAggregator } from "../agents/index.js";

export class SlashReviewAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.slash-review";

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      await ev.action.setTitle("...");
      const agent = stateAggregator.getActiveAgent();
      if (!agent) {
        await ev.action.showAlert();
        return;
      }
      await agent.sendText("/review");
      await ev.action.showOk();
    } catch (error) {
      streamDeck.logger.error("Failed to send /review:", error);
      await ev.action.showAlert();
    } finally {
      await ev.action.setTitle("");
    }
  }
}
