import { SingletonAction, type WillAppearEvent, type WillDisappearEvent, type KeyDownEvent } from "@elgato/streamdeck";
import { claudeController, type ClaudeState } from "../utils/claude-controller.js";

/**
 * Model Display Action - Shows current model with visual badge
 *
 * Displays the current model (Sonnet/Opus/Haiku) with color coding
 * Press to cycle models
 */
export class ModelDisplayAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.model-display";

  private updateHandler?: (state: ClaudeState) => void;
  private currentAction?: WillAppearEvent["action"];

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.currentAction = ev.action;

    const state = claudeController.getState();
    await this.updateDisplay(ev.action, state);

    this.updateHandler = async (newState: ClaudeState) => {
      if (this.currentAction) {
        await this.updateDisplay(this.currentAction, newState);
      }
    };
    claudeController.on("stateChange", this.updateHandler);
  }

  override async onWillDisappear(_ev: WillDisappearEvent): Promise<void> {
    this.currentAction = undefined;
    if (this.updateHandler) {
      claudeController.off("stateChange", this.updateHandler);
      this.updateHandler = undefined;
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    // Cycle to next model on press
    const success = await claudeController.switchModel();
    if (success) {
      await ev.action.showOk();
    } else {
      await ev.action.showAlert();
    }
  }

  private async updateDisplay(action: WillAppearEvent["action"], state: ClaudeState): Promise<void> {
    const model = state.currentModel || "sonnet";
    const svg = this.createModelSvg(model);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private createModelSvg(model: string): string {
    const configs: Record<string, { color: string; bgColor: string; icon: string }> = {
      opus: {
        color: "#a855f7",
        bgColor: "#2d1f3d",
        icon: "◆" // Diamond for premium
      },
      sonnet: {
        color: "#f97316",
        bgColor: "#2d1f1a",
        icon: "●" // Circle for balanced
      },
      haiku: {
        color: "#06b6d4",
        bgColor: "#1a2d2d",
        icon: "○" // Light circle for fast
      },
    };

    const config = configs[model] || configs.sonnet;
    const displayName = model.charAt(0).toUpperCase() + model.slice(1);

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="${config.bgColor}" rx="12"/>

        <!-- Model icon -->
        <text x="72" y="60" font-family="system-ui, sans-serif" font-size="36" fill="${config.color}" text-anchor="middle">${config.icon}</text>

        <!-- Model name -->
        <text x="72" y="95" font-family="system-ui, sans-serif" font-size="22" fill="${config.color}" text-anchor="middle" font-weight="bold">${displayName}</text>

        <!-- Subtitle -->
        <text x="72" y="120" font-family="system-ui, sans-serif" font-size="12" fill="#666" text-anchor="middle">TAP TO SWITCH</text>
      </svg>
    `;
  }
}
