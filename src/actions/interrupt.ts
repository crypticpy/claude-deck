import {
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
  type DidReceiveSettingsEvent,
} from "@elgato/streamdeck";
import {
  stateAggregator,
  type AgentState,
  type AggregatedState,
} from "../agents/index.js";

/**
 * Settings for the Interrupt action
 */
interface InterruptSettings {
  /** Optional: target a specific agent instead of the active one (for Dashboard mode) */
  targetAgent?: string;
}

/**
 * Interrupt Action - Sends Ctrl+C to stop the current operation
 *
 * This is a universal action that works with any registered agent (Claude, Aider, etc.)
 * By default, it sends the interrupt command (Ctrl+C) to whichever agent is currently active/focused.
 *
 * Visual feedback:
 * - Working: Bright orange/red stop icon with "STOP" label (interrupt is relevant)
 * - Permission pending: Dimmed (user should approve/reject, not interrupt)
 * - Idle/Disconnected: Static muted gray stop icon
 *
 * Dashboard Mode: Set `targetAgent` in settings to always target a specific agent,
 * regardless of which agent is currently active.
 */
export class InterruptAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.interrupt";

  private actionSettings = new Map<string, InterruptSettings>();
  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private stateHandler?: (state: AggregatedState) => void;

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    const settings = (ev.payload.settings as InterruptSettings) || {};
    this.actionSettings.set(ev.action.id, settings);
    this.activeActions.set(ev.action.id, ev.action);

    // Set initial display
    const agentState = this.resolveAgentState(settings);
    await this.updateDisplay(ev.action, agentState, settings);

    // Subscribe to state changes (shared handler for all button instances)
    if (!this.stateHandler) {
      this.stateHandler = () => {
        void this.updateAllDisplays().catch(() => {
          // ignore
        });
      };
      stateAggregator.on("stateChange", this.stateHandler);
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    this.actionSettings.delete(ev.action.id);

    if (this.activeActions.size === 0 && this.stateHandler) {
      stateAggregator.removeListener("stateChange", this.stateHandler);
      this.stateHandler = undefined;
    }
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent,
  ): Promise<void> {
    const settings = (ev.payload.settings as InterruptSettings) || {};
    this.actionSettings.set(ev.action.id, settings);
  }

  /**
   * Resolve the agent state to display, considering targetAgent setting
   */
  private resolveAgentState(
    settings: InterruptSettings,
  ): AgentState | undefined {
    if (settings.targetAgent) {
      return stateAggregator.getAgentState(settings.targetAgent);
    }
    const activeId = stateAggregator.getActiveAgentId();
    if (activeId) {
      return stateAggregator.getAgentState(activeId);
    }
    return undefined;
  }

  private async updateAllDisplays(): Promise<void> {
    if (this.activeActions.size === 0) return;
    await Promise.allSettled(
      [...this.activeActions.entries()].map(([actionId, action]) => {
        const settings = this.actionSettings.get(actionId) || {};
        const agentState = this.resolveAgentState(settings);
        return this.updateDisplay(action, agentState, settings);
      }),
    );
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
    state: AgentState | undefined,
    settings: InterruptSettings,
  ): Promise<void> {
    let svg: string;

    if (state?.status === "working" && !state.hasPermissionPending) {
      // Bright orange/red - agent is working, interrupt is relevant
      svg = this.generateWorkingSvg();
    } else if (state?.hasPermissionPending) {
      // Dimmed - permission pending, user should approve/reject not interrupt
      svg = this.generatePendingSvg();
    } else {
      // Static muted gray - idle or disconnected
      svg = this.generateIdleSvg();
    }

    await action.setImage(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    );

    // Clear title so SVG is the sole visual
    await action.setTitle("");
  }

  /**
   * Bright orange/red SVG - agent is working, interrupt is relevant
   */
  private generateWorkingSvg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="#2a1a0a" rx="12"/>
  <circle cx="72" cy="60" r="35" fill="#f97316" opacity="0.3">
    <animate attributeName="opacity" values="0.3;0.5;0.3" dur="1.5s" repeatCount="indefinite"/>
  </circle>
  <circle cx="72" cy="60" r="35" fill="none" stroke="#f97316" stroke-width="3">
    <animate attributeName="stroke-width" values="3;5;3" dur="1.5s" repeatCount="indefinite"/>
  </circle>
  <rect x="52" y="40" width="40" height="40" rx="4" fill="#f97316"/>
  <text x="72" y="115" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="#f97316" text-anchor="middle">STOP</text>
</svg>`;
  }

  /**
   * Dimmed SVG - permission pending, interrupt is less relevant
   */
  private generatePendingSvg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="#0f172a" rx="12"/>
  <circle cx="72" cy="60" r="35" fill="#f97316" opacity="0.08"/>
  <circle cx="72" cy="60" r="35" fill="none" stroke="#f97316" stroke-width="2" opacity="0.3"/>
  <rect x="52" y="40" width="40" height="40" rx="4" fill="#f97316" opacity="0.3"/>
</svg>`;
  }

  /**
   * Static muted gray SVG - idle or disconnected
   */
  private generateIdleSvg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="#0f172a" rx="12"/>
  <circle cx="72" cy="60" r="35" fill="#6b7280" opacity="0.1"/>
  <circle cx="72" cy="60" r="35" fill="none" stroke="#6b7280" stroke-width="2" opacity="0.4"/>
  <rect x="52" y="40" width="40" height="40" rx="4" fill="#6b7280" opacity="0.4"/>
</svg>`;
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const settings = this.actionSettings.get(ev.action.id) || {};

    try {
      await ev.action.setTitle("...");

      let success: boolean;
      if (settings.targetAgent) {
        // Target specific agent (Dashboard mode)
        const agent = stateAggregator.getAgent(settings.targetAgent);
        if (agent && agent.capabilities.interrupt) {
          success = await agent.interrupt();
        } else {
          success = false;
        }
      } else {
        // Target active agent (default)
        success = await stateAggregator.interrupt();
      }

      if (success) {
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("Interrupt action failed:", error);
      await ev.action.showAlert();
    } finally {
      // Clear title so SVG takes over on next state update
      await ev.action.setTitle("");
    }
  }
}
