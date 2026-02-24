import streamDeck, { SingletonAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { stateAggregator, type AggregatedState, type PermissionMode, claudeAgent } from "../agents/index.js";

/**
 * Mode Cycle Action - Cycles through permission modes for the active agent
 *
 * This action works with any agent that supports mode cycling (primarily Claude).
 * If the active agent doesn't support mode cycling, it will show an alert.
 *
 * Mode tracking:
 * - Reads initial mode from state.json on appear
 * - After cycling, calculates next mode and persists to state.json
 * - Resets to "default" on session-start (via hooks)
 */
export class ModeCycleAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.mode-cycle";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private updateHandler?: (state: AggregatedState) => void;

  // Mode cycle order (Claude's Shift+Tab order)
  private static readonly MODE_ORDER: PermissionMode[] = [
    "default",
    "plan",
    "acceptEdits",
    "dontAsk",
    "bypassPermissions",
  ];

  private modeColors: Record<string, string> = {
    default: "#6b7280",           // gray
    plan: "#3b82f6",              // blue
    acceptEdits: "#f59e0b",       // amber
    dontAsk: "#ef4444",           // red
    bypassPermissions: "#22c55e", // green (yolo)
    yolo: "#22c55e",              // alias
    auto: "#ef4444",              // alias
  };

  private modeLabels: Record<string, string> = {
    default: "NORMAL",
    plan: "PLAN",
    acceptEdits: "EDITS",
    dontAsk: "AUTO",
    bypassPermissions: "YOLO",
    yolo: "YOLO",
    auto: "AUTO",
  };

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    await this.updateDisplay(ev.action);

    if (!this.updateHandler) {
      this.updateHandler = () => {
        void this.updateAllDisplays().catch((err) => {
          streamDeck.logger.debug("ModeCycleAction update failed:", err);
        });
      };
      stateAggregator.on("stateChange", this.updateHandler);
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    if (this.activeActions.size === 0 && this.updateHandler) {
      stateAggregator.off("stateChange", this.updateHandler);
      this.updateHandler = undefined;
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      const activeAgent = stateAggregator.getActiveAgent();
      const agentState = activeAgent ? stateAggregator.getAgentState(activeAgent.id) : null;

      // Check if active agent supports mode cycling
      if (!activeAgent || !activeAgent.capabilities.modeSwitch) {
        await ev.action.showAlert();
        return;
      }

      // Send mode cycle to active agent
      const success = await stateAggregator.cycleMode();

      if (success) {
        // Calculate and persist the next mode (for Claude agent)
        if (activeAgent.id === "claude") {
          const currentMode = (agentState?.mode as PermissionMode) || "default";
          const nextMode = this.getNextMode(currentMode);
          await claudeAgent.setPermissionMode(nextMode);
        }
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      streamDeck.logger.error("Mode cycle failed:", error);
      await ev.action.showAlert();
    }
  }

  /**
   * Calculate the next mode in the cycle
   */
  private getNextMode(currentMode: PermissionMode): PermissionMode {
    const currentIndex = ModeCycleAction.MODE_ORDER.indexOf(currentMode);
    const nextIndex = (currentIndex + 1) % ModeCycleAction.MODE_ORDER.length;
    return ModeCycleAction.MODE_ORDER[nextIndex];
  }

  private async updateAllDisplays(): Promise<void> {
    if (this.activeActions.size === 0) return;
    await Promise.allSettled([...this.activeActions.values()].map((action) => this.updateDisplay(action)));
  }

  private async updateDisplay(action: WillAppearEvent["action"]): Promise<void> {
    const activeAgent = stateAggregator.getActiveAgent();
    const agentState = activeAgent ? stateAggregator.getAgentState(activeAgent.id) : null;

    const mode = (agentState?.mode as PermissionMode) || "default";
    const color = this.modeColors[mode] || this.modeColors.default;
    const label = this.modeLabels[mode] || mode.toUpperCase();

    const svg = this.generateModeSvg(label, color);
    const base64 = Buffer.from(svg).toString("base64");
    await action.setImage(`data:image/svg+xml;base64,${base64}`);
  }

  private generateModeSvg(label: string, color: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="#0f172a" rx="12"/>
  <circle cx="72" cy="55" r="32" fill="${color}" opacity="0.2"/>
  <circle cx="72" cy="55" r="32" fill="none" stroke="${color}" stroke-width="3"/>
  <!-- Cycle arrows -->
  <path d="M48 55 A24 24 0 0 1 72 31" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M67 33 L72 31 L73 36" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M96 55 A24 24 0 0 1 72 79" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M77 77 L72 79 L71 74" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="72" y="60" font-family="system-ui" font-size="14" font-weight="bold" fill="${color}" text-anchor="middle">${label === "YOLO" ? "!" : label.charAt(0)}</text>
  <text x="72" y="115" font-family="system-ui" font-size="16" font-weight="bold" fill="${color}" text-anchor="middle">${label}</text>
</svg>`;
  }
}
