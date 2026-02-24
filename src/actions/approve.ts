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
 * Settings for the Approve action
 */
interface ApproveSettings {
  /** Optional: target a specific agent instead of the active one (for Dashboard mode) */
  targetAgent?: string;
}

/**
 * Approve Action - Accepts the pending permission request
 *
 * This is a universal action that works with any registered agent (Claude, Aider, etc.)
 * By default, it sends the approve command to whichever agent is currently active/focused.
 *
 * Visual feedback:
 * - Permission pending: Pulsing bright green checkmark with "APPROVE" label
 * - Working (no permission): Dimmed green checkmark, opacity 0.3
 * - Idle/Disconnected: Static muted gray checkmark
 *
 * Dashboard Mode: Set `targetAgent` in settings to always target a specific agent,
 * regardless of which agent is currently active.
 */
export class ApproveAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.approve";

  private actionSettings = new Map<string, ApproveSettings>();
  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private stateHandler?: (state: AggregatedState) => void;

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    const settings = (ev.payload.settings as ApproveSettings) || {};
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
    const settings = (ev.payload.settings as ApproveSettings) || {};
    this.actionSettings.set(ev.action.id, settings);
  }

  /**
   * Resolve the agent state to display, considering targetAgent setting
   */
  private resolveAgentState(settings: ApproveSettings): AgentState | undefined {
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
    settings: ApproveSettings,
  ): Promise<void> {
    let svg: string;

    if (state?.hasPermissionPending) {
      // PULSING bright green - permission is pending, approve is relevant
      svg = this.generatePendingSvg();
    } else if (state?.status === "working") {
      // Dimmed green - agent is working, no permission to approve
      svg = this.generateWorkingSvg();
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
   * Pulsing bright green SVG - permission pending
   */
  private generatePendingSvg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="#052e16" rx="12"/>
  <circle cx="72" cy="60" r="35" fill="#22c55e" opacity="0.3">
    <animate attributeName="opacity" values="0.3;0.6;0.3" dur="1.2s" repeatCount="indefinite"/>
  </circle>
  <circle cx="72" cy="60" r="35" fill="none" stroke="#22c55e" stroke-width="3">
    <animate attributeName="stroke-width" values="3;5;3" dur="1.2s" repeatCount="indefinite"/>
  </circle>
  <path d="M55 60 L67 72 L89 48" fill="none" stroke="#22c55e" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="72" y="115" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="#22c55e" text-anchor="middle">APPROVE</text>
</svg>`;
  }

  /**
   * Dimmed green SVG - working, no pending permission
   */
  private generateWorkingSvg(): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="#0f172a" rx="12"/>
  <circle cx="72" cy="60" r="35" fill="#22c55e" opacity="0.08"/>
  <circle cx="72" cy="60" r="35" fill="none" stroke="#22c55e" stroke-width="2" opacity="0.3"/>
  <path d="M55 60 L67 72 L89 48" fill="none" stroke="#22c55e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/>
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
  <path d="M55 60 L67 72 L89 48" fill="none" stroke="#6b7280" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/>
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
        if (agent && agent.capabilities.approve) {
          success = await agent.approve();
        } else {
          success = false;
        }
      } else {
        // Target active agent (default)
        success = await stateAggregator.approve();
      }

      if (success) {
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("Approve action failed:", error);
      await ev.action.showAlert();
    } finally {
      // Clear title so SVG takes over on next state update
      await ev.action.setTitle("");
    }
  }
}
