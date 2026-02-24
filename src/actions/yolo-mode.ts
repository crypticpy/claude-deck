import {
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import {
  claudeAgent,
  stateAggregator,
  type AgentState,
} from "../agents/index.js";

/**
 * YOLO Mode Action - Toggle auto-approve mode (bypass all permissions)
 */
export class YoloModeAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.yolo-mode";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private updateHandler?: (state: AgentState) => void;

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);

    const state = claudeAgent.getState();
    await this.updateDisplay(ev.action, state);

    if (!this.updateHandler) {
      this.updateHandler = (newState: AgentState) => {
        void this.updateAllWithState(newState).catch(() => {
          // ignore
        });
      };
      claudeAgent.on("stateChange", this.updateHandler);
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      const success = await stateAggregator.cycleMode();

      if (success) {
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("YOLO mode toggle failed:", error);
      await ev.action.showAlert();
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    if (this.activeActions.size === 0 && this.updateHandler) {
      claudeAgent.off("stateChange", this.updateHandler);
      this.updateHandler = undefined;
    }
  }

  private async updateAllWithState(state: AgentState): Promise<void> {
    if (this.activeActions.size === 0) return;
    await Promise.allSettled(
      [...this.activeActions.values()].map((action) =>
        this.updateDisplay(action, state),
      ),
    );
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
    state: AgentState,
  ): Promise<void> {
    const isYoloOn =
      state.mode === "bypassPermissions" || state.mode === "yolo";
    const svg = this.createYoloSvg(isYoloOn);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private createYoloSvg(isActive: boolean): string {
    if (isActive) {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
          <rect width="144" height="144" fill="#450a0a" rx="12"/>
          <rect x="8" y="8" width="128" height="128" fill="none" stroke="#ef4444" stroke-width="3" rx="8" stroke-dasharray="8,4"/>
          <text x="72" y="55" font-family="system-ui, sans-serif" font-size="28" fill="#ef4444" text-anchor="middle" font-weight="bold">EXIT</text>
          <text x="72" y="85" font-family="system-ui, sans-serif" font-size="24" fill="#ef4444" text-anchor="middle" font-weight="bold">YOLO</text>
          <text x="72" y="120" font-family="system-ui, sans-serif" font-size="11" fill="#fca5a5" text-anchor="middle">Tap to disable</text>
        </svg>
      `;
    }
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#052e16" rx="12"/>
        <text x="72" y="75" font-family="system-ui, sans-serif" font-size="32" fill="#22c55e" text-anchor="middle" font-weight="bold">YOLO</text>
        <text x="72" y="110" font-family="system-ui, sans-serif" font-size="11" fill="#86efac" text-anchor="middle">Tap to enable</text>
      </svg>
    `;
  }
}
