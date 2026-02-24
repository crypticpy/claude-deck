import { SingletonAction, type KeyDownEvent, type WillAppearEvent, type DidReceiveSettingsEvent } from "@elgato/streamdeck";
import { stateAggregator, AGENT_COLORS } from "../agents/index.js";

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
 * Dashboard Mode: Set `targetAgent` in settings to always target a specific agent,
 * regardless of which agent is currently active.
 */
export class InterruptAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.interrupt";

  private actionSettings = new Map<string, InterruptSettings>();

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    const settings = (ev.payload.settings as InterruptSettings) || {};
    this.actionSettings.set(ev.action.id, settings);
    await this.updateDisplay(ev, settings);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent): Promise<void> {
    const settings = (ev.payload.settings as InterruptSettings) || {};
    this.actionSettings.set(ev.action.id, settings);
  }

  private async updateDisplay(ev: WillAppearEvent, settings: InterruptSettings): Promise<void> {
    if (settings.targetAgent) {
      const agent = stateAggregator.getAgent(settings.targetAgent);
      const agentColor = AGENT_COLORS[settings.targetAgent];
      if (agent) {
        // Show agent-specific stop button with color indicator
        await ev.action.setTitle(`⏹\n${agent.name}`);
        if (agentColor) {
          const svg = this.generateColoredSvg(agentColor.primary);
          await ev.action.setImage(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
        }
        return;
      }
    }
    await ev.action.setTitle("Stop");
  }

  private generateColoredSvg(color: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
      <rect width="144" height="144" fill="#0f172a" rx="12"/>
      <circle cx="72" cy="60" r="35" fill="${color}" opacity="0.2"/>
      <rect x="52" y="40" width="40" height="40" rx="4" fill="${color}"/>
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
      const refreshSettings = this.actionSettings.get(ev.action.id) || {};
      if (refreshSettings.targetAgent) {
        const agent = stateAggregator.getAgent(refreshSettings.targetAgent);
        await ev.action.setTitle(`⏹\n${agent?.name ?? "Agent"}`);
      } else {
        await ev.action.setTitle("Stop");
      }
    }
  }
}
