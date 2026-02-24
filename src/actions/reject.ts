import { SingletonAction, type KeyDownEvent, type WillAppearEvent, type DidReceiveSettingsEvent } from "@elgato/streamdeck";
import { stateAggregator, AGENT_COLORS } from "../agents/index.js";

/**
 * Settings for the Reject action
 */
interface RejectSettings {
  /** Optional: target a specific agent instead of the active one (for Dashboard mode) */
  targetAgent?: string;
}

/**
 * Reject Action - Declines the pending permission request
 *
 * This is a universal action that works with any registered agent (Claude, Aider, etc.)
 * By default, it sends the reject command to whichever agent is currently active/focused.
 *
 * Dashboard Mode: Set `targetAgent` in settings to always target a specific agent,
 * regardless of which agent is currently active.
 */
export class RejectAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.reject";

  private actionSettings = new Map<string, RejectSettings>();

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    const settings = (ev.payload.settings as RejectSettings) || {};
    this.actionSettings.set(ev.action.id, settings);
    await this.updateDisplay(ev, settings);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent): Promise<void> {
    const settings = (ev.payload.settings as RejectSettings) || {};
    this.actionSettings.set(ev.action.id, settings);
  }

  private async updateDisplay(ev: WillAppearEvent, settings: RejectSettings): Promise<void> {
    if (settings.targetAgent) {
      const agent = stateAggregator.getAgent(settings.targetAgent);
      const agentColor = AGENT_COLORS[settings.targetAgent];
      if (agent) {
        // Show agent-specific reject button with color indicator
        await ev.action.setTitle(`✕\n${agent.name}`);
        if (agentColor) {
          const svg = this.generateColoredSvg(agentColor.primary);
          await ev.action.setImage(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
        }
        return;
      }
    }
    await ev.action.setTitle("Reject");
  }

  private generateColoredSvg(color: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
      <rect width="144" height="144" fill="#0f172a" rx="12"/>
      <circle cx="72" cy="60" r="35" fill="${color}" opacity="0.2"/>
      <path d="M55 45 L90 75 M90 45 L55 75" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"/>
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
        if (agent && agent.capabilities.reject) {
          success = await agent.reject();
        } else {
          success = false;
        }
      } else {
        // Target active agent (default)
        success = await stateAggregator.reject();
      }

      if (success) {
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("Reject action failed:", error);
      await ev.action.showAlert();
    } finally {
      const refreshSettings = this.actionSettings.get(ev.action.id) || {};
      if (refreshSettings.targetAgent) {
        const agent = stateAggregator.getAgent(refreshSettings.targetAgent);
        await ev.action.setTitle(`✕\n${agent?.name ?? "Agent"}`);
      } else {
        await ev.action.setTitle("Reject");
      }
    }
  }
}
