import { SingletonAction, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { claudeController } from "../utils/claude-controller.js";

/**
 * YOLO Mode Action - Toggle auto-approve mode (bypass all permissions)
 */
export class YoloModeAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.yolo-mode";

  private isYoloOn = false;

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    const state = claudeController.getState();
    this.isYoloOn = state.permissionMode === "bypassPermissions";
    if ("setState" in ev.action) {
      await ev.action.setState(this.isYoloOn ? 1 : 0);
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      const success = await claudeController.togglePermissionMode();

      if (success) {
        this.isYoloOn = !this.isYoloOn;
        if ("setState" in ev.action) {
          await ev.action.setState(this.isYoloOn ? 1 : 0);
        }
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("YOLO mode toggle failed:", error);
      await ev.action.showAlert();
    }
  }
}
