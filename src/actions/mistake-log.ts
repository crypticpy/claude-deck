import {
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { stateAggregator } from "../agents/index.js";
import { svgToDataUri } from "../utils/svg-utils.js";

/**
 * Mistake Log Action - Quick-log mistakes to context-layer brain
 *
 * Tap: Log a medium severity mistake
 * Sends command to Claude to log via MCP
 */
export class MistakeLogAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.mistake-log";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private mistakeCount = 0;

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    await this.updateDisplay(ev.action);
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      await ev.action.setTitle("!");

      // Send mistake log command to the active agent
      const ok =
        (await stateAggregator
          .getActiveAgent()
          ?.sendText(
            "Log this as a mistake: Something went wrong - please describe what happened and log it to my brain using mistake_log",
          )) ?? false;

      if (ok) {
        this.mistakeCount++;
        await this.updateAll();
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("Mistake log failed:", error);
      await ev.action.showAlert();
    }
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
  ): Promise<void> {
    const svg = this.createMistakeSvg();
    await action.setImage(svgToDataUri(svg));
  }

  private async updateAll(): Promise<void> {
    await Promise.allSettled(
      [...this.activeActions.values()].map((action) =>
        this.updateDisplay(action),
      ),
    );
  }

  private createMistakeSvg(): string {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Warning triangle -->
        <path d="M72 35 L105 95 L39 95 Z" fill="#ef4444" opacity="0.2"/>
        <path d="M72 35 L105 95 L39 95 Z" fill="none" stroke="#ef4444" stroke-width="3" stroke-linejoin="round"/>

        <!-- Exclamation mark -->
        <line x1="72" y1="55" x2="72" y2="75" stroke="#ef4444" stroke-width="4" stroke-linecap="round"/>
        <circle cx="72" cy="85" r="3" fill="#ef4444"/>

        <!-- Label -->
        <text x="72" y="115" font-family="system-ui, sans-serif" font-size="11" fill="#ef4444" text-anchor="middle" font-weight="bold">MISTAKE</text>
        <text x="72" y="130" font-family="system-ui, sans-serif" font-size="9" fill="#64748b" text-anchor="middle">Count: ${this.mistakeCount}</text>
      </svg>
    `;
  }
}
