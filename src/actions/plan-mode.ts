import { SingletonAction, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { claudeController } from "../utils/claude-controller.js";

/**
 * Plan Mode Action - Toggle read-only planning mode
 */
export class PlanModeAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.plan-mode";

  private isPlanOn = false;

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    const state = claudeController.getState();
    this.isPlanOn = state.permissionMode === "plan";
    if ("setState" in ev.action) {
      await ev.action.setState(this.isPlanOn ? 1 : 0);
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      const success = await claudeController.togglePermissionMode();

      if (success) {
        this.isPlanOn = !this.isPlanOn;
        if ("setState" in ev.action) {
          await ev.action.setState(this.isPlanOn ? 1 : 0);
        }
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("Plan mode toggle failed:", error);
      await ev.action.showAlert();
    }
  }
}
