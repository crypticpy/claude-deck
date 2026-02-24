import {
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import {
  stateAggregator,
  type AgentState,
  type AggregatedState,
} from "../agents/index.js";

/**
 * YOLO Mode Action - Toggle auto-approve mode (bypass all permissions)
 *
 * Since there is no direct "set mode" API in Claude Code, pressing this
 * button cycles modes via Shift+Tab. The display honestly reflects the
 * current mode and whether YOLO is active.
 */
export class YoloModeAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.yolo-mode";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private stateHandler?: (state: AggregatedState) => void;

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);

    const agentState = this.getActiveAgentState();
    await this.updateDisplay(ev.action, agentState);

    if (!this.stateHandler) {
      this.stateHandler = () => {
        void this.updateAllDisplays().catch(() => {
          // ignore
        });
      };
      stateAggregator.on("stateChange", this.stateHandler);
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
    if (this.activeActions.size === 0 && this.stateHandler) {
      stateAggregator.removeListener("stateChange", this.stateHandler);
      this.stateHandler = undefined;
    }
  }

  private getActiveAgentState(): AgentState | undefined {
    const activeId = stateAggregator.getActiveAgentId();
    if (activeId) {
      return stateAggregator.getAgentState(activeId);
    }
    return undefined;
  }

  private async updateAllDisplays(): Promise<void> {
    if (this.activeActions.size === 0) return;
    const agentState = this.getActiveAgentState();
    await Promise.allSettled(
      [...this.activeActions.values()].map((action) =>
        this.updateDisplay(action, agentState),
      ),
    );
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
    state: AgentState | undefined,
  ): Promise<void> {
    const mode = state?.mode || "default";
    const isYoloOn =
      mode === "bypassPermissions" || mode === "yolo" || mode === "dontAsk";
    const svg = this.createYoloSvg(isYoloOn, mode);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private getModeLabel(mode: string): string {
    const labels: Record<string, string> = {
      default: "DEFAULT",
      plan: "PLAN",
      acceptEdits: "EDITS",
      bypassPermissions: "YOLO",
      dontAsk: "YOLO",
      yolo: "YOLO",
    };
    return labels[mode] || mode.toUpperCase();
  }

  private createYoloSvg(isActive: boolean, mode: string): string {
    if (isActive) {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
          <rect width="144" height="144" fill="#450a0a" rx="12"/>
          <rect x="8" y="8" width="128" height="128" fill="none" stroke="#ef4444" stroke-width="3" rx="8" stroke-dasharray="8,4"/>
          <text x="72" y="50" font-family="system-ui, sans-serif" font-size="28" fill="#ef4444" text-anchor="middle" font-weight="bold">YOLO</text>
          <circle cx="52" cy="78" r="5" fill="#ef4444"/>
          <text x="72" y="84" font-family="system-ui, sans-serif" font-size="18" fill="#fca5a5" text-anchor="middle" font-weight="bold">ON</text>
          <text x="72" y="120" font-family="system-ui, sans-serif" font-size="11" fill="#fca5a5" text-anchor="middle">Shift+Tab: cycle</text>
        </svg>
      `;
    }
    const modeLabel = this.getModeLabel(mode);
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>
        <text x="72" y="35" font-family="system-ui, sans-serif" font-size="12" fill="#64748b" text-anchor="middle">YOLO</text>
        <circle cx="50" cy="58" r="4" fill="#475569"/>
        <text x="70" y="64" font-family="system-ui, sans-serif" font-size="14" fill="#64748b" text-anchor="middle">OFF</text>
        <text x="72" y="95" font-family="system-ui, sans-serif" font-size="18" fill="#94a3b8" text-anchor="middle" font-weight="bold">${modeLabel}</text>
        <text x="72" y="120" font-family="system-ui, sans-serif" font-size="11" fill="#475569" text-anchor="middle">Shift+Tab: cycle</text>
      </svg>
    `;
  }
}
