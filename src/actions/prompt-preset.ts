import {
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
  type DidReceiveSettingsEvent,
} from "@elgato/streamdeck";
import { claudeAgent } from "../agents/index.js";
import { escapeXml } from "../utils/svg-utils.js";

interface PromptPresetSettings {
  prompt?: string;
  label?: string;
  color?: string;
}

/**
 * Prompt Preset Action - Configurable saved prompt that can be triggered with one tap
 */
export class PromptPresetAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.prompt-preset";

  private settingsById = new Map<string, PromptPresetSettings>();

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.settingsById.set(
      ev.action.id,
      (ev.payload.settings as PromptPresetSettings) || {},
    );
    await this.updateDisplay(ev.action);
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent,
  ): Promise<void> {
    this.settingsById.set(
      ev.action.id,
      (ev.payload.settings as PromptPresetSettings) || {},
    );
    await this.updateDisplay(ev.action);
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.settingsById.delete(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      const settings = this.getSettings(ev.action.id);
      const prompt = settings.prompt || "Hello!";
      await ev.action.setTitle("...");
      await claudeAgent.sendText(prompt);
      await ev.action.showOk();
    } catch (error) {
      console.error("Prompt preset failed:", error);
      await ev.action.showAlert();
    } finally {
      await this.updateDisplay(ev.action);
    }
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
  ): Promise<void> {
    const settings = this.getSettings(action.id);
    const svg = this.createPresetSvg(settings);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private getSettings(actionId: string): PromptPresetSettings {
    const stored = this.settingsById.get(actionId) ?? {};
    return {
      prompt: "Please summarize the changes you made.",
      label: "Summary",
      color: "#3b82f6",
      ...stored,
    };
  }

  private createPresetSvg(settings: PromptPresetSettings): string {
    const label = settings.label || "Preset";
    const color = settings.color || "#3b82f6";
    const displayLabel = label.length > 8 ? label.slice(0, 7) + "…" : label;

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>
        <!-- Chat bubble -->
        <path d="M35 40 L109 40 Q115 40 115 46 L115 80 Q115 86 109 86 L80 86 L72 98 L64 86 L35 86 Q29 86 29 80 L29 46 Q29 40 35 40" fill="${color}" opacity="0.2"/>
        <path d="M35 40 L109 40 Q115 40 115 46 L115 80 Q115 86 109 86 L80 86 L72 98 L64 86 L35 86 Q29 86 29 80 L29 46 Q29 40 35 40" fill="none" stroke="${color}" stroke-width="3"/>
        <!-- Lines inside bubble -->
        <line x1="45" y1="55" x2="99" y2="55" stroke="${color}" stroke-width="2" opacity="0.5"/>
        <line x1="45" y1="67" x2="85" y2="67" stroke="${color}" stroke-width="2" opacity="0.5"/>
        <text x="72" y="120" font-family="system-ui" font-size="13" fill="${color}" text-anchor="middle" font-weight="bold">${escapeXml(displayLabel)}</text>
      </svg>
    `;
  }
}
