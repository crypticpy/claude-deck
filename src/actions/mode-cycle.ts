import streamDeck, { action, SingletonAction, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { claudeController, type ClaudeState } from "../utils/claude-controller.js";

type PermissionMode = ClaudeState["permissionMode"];

/**
 * Mode Cycle Action - Cycles through permission modes (Shift+Tab)
 * Modes: default → plan → acceptEdits → bypassPermissions → default
 *
 * Note: Mode is tracked locally in state.json. If you change mode via keyboard
 * (Shift+Tab) in Claude, the button won't know. Use the button for accurate tracking.
 */
@action({ UUID: "com.anthropic.claude-deck.mode-cycle" })
export class ModeCycleAction extends SingletonAction {
  private updateInterval?: ReturnType<typeof setInterval>;

  // Cycle: NORMAL → PLAN → EDITS (no YOLO - requires CLI flag)
  private modes: PermissionMode[] = ["default", "plan", "acceptEdits"];

  private modeColors: Record<PermissionMode, string> = {
    default: "#6b7280",           // gray
    plan: "#3b82f6",              // blue
    acceptEdits: "#f59e0b",       // amber
    dontAsk: "#ef4444",           // red
    bypassPermissions: "#22c55e", // green (yolo)
  };

  private modeLabels: Record<PermissionMode, string> = {
    default: "NORMAL",
    plan: "PLAN",
    acceptEdits: "EDITS",
    dontAsk: "AUTO",
    bypassPermissions: "YOLO",
  };

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await this.updateDisplay(ev);

    // Poll state file to stay in sync
    this.updateInterval = setInterval(async () => {
      await this.updateDisplay(ev);
    }, 500);
  }

  override async onWillDisappear(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      // Get current mode from state
      const state = claudeController.getState();
      const currentMode = state.permissionMode || "default";

      // Calculate next mode
      const currentIndex = this.modes.indexOf(currentMode);
      const nextIndex = (currentIndex + 1) % this.modes.length;
      const nextMode = this.modes[nextIndex];

      // Send Shift+Tab to Claude to cycle mode
      const success = await claudeController.togglePermissionMode();

      if (success) {
        // Update state.json with new mode
        await claudeController.setPermissionMode(nextMode);
        await ev.action.showOk();
        await this.updateDisplay(ev);
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      streamDeck.logger.error("Mode cycle failed:", error);
      await ev.action.showAlert();
    }
  }

  private async updateDisplay(ev: WillAppearEvent | KeyDownEvent): Promise<void> {
    const state = claudeController.getState();
    const mode = state.permissionMode || "default";
    const color = this.modeColors[mode] || this.modeColors.default;
    const label = this.modeLabels[mode] || mode.toUpperCase();

    const svg = this.generateModeSvg(label, color);
    const base64 = Buffer.from(svg).toString("base64");
    await ev.action.setImage(`data:image/svg+xml;base64,${base64}`);
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
