import streamDeck, {
  SingletonAction,
  type KeyDownEvent,
} from "@elgato/streamdeck";
import { stateAggregator } from "../agents/index.js";

export class SlashCommitAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.slash-commit";

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      await ev.action.setTitle("...");
      const agent = stateAggregator.getActiveAgent();
      if (!agent) {
        await ev.action.showAlert();
        return;
      }
      await agent.sendText("/commit");
      await ev.action.showOk();
    } catch (error) {
      streamDeck.logger.error("Failed to send /commit:", error);
      await ev.action.showAlert();
    } finally {
      await ev.action.setTitle("");
    }
  }
}
