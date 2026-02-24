import { SingletonAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent, type DidReceiveSettingsEvent } from "@elgato/streamdeck";
import { claudeAgent } from "../agents/index.js";

interface SlashCommandSettings {
  command?: string;
  label?: string;
}

/**
 * Slash Command Action - Configurable button to run any slash command
 *
 * Settings:
 * - command: The slash command to run (e.g., "/help", "/commit", "/clear")
 * - label: Optional custom label for the button
 */
export class SlashCommandAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.slash-command";

  private settingsById = new Map<string, SlashCommandSettings>();

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.settingsById.set(ev.action.id, (ev.payload.settings as SlashCommandSettings) || {});
    await this.updateDisplay(ev.action);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent): Promise<void> {
    this.settingsById.set(ev.action.id, (ev.payload.settings as SlashCommandSettings) || {});
    await this.updateDisplay(ev.action);
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.settingsById.delete(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      const settings = this.getSettings(ev.action.id);
      const command = settings.command || "/help";
      await ev.action.setTitle("...");

      // Send the slash command to Claude
      const success = await claudeAgent.sendText(command);

      if (success) {
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("Slash command failed:", error);
      await ev.action.showAlert();
    } finally {
      await this.updateDisplay(ev.action);
    }
  }

  private async updateDisplay(action: WillAppearEvent["action"]): Promise<void> {
    const settings = this.getSettings(action.id);
    const svg = this.createCommandSvg(settings);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private getSettings(actionId: string): SlashCommandSettings {
    const stored = this.settingsById.get(actionId) ?? {};
    return { command: "/help", label: "Help", ...stored };
  }

  private getCommandColor(command: string): string {
    const cmd = command.toLowerCase();
    if (cmd.includes("commit")) return "#f59e0b";
    if (cmd.includes("clear") || cmd.includes("compact")) return "#ef4444";
    if (cmd.includes("help") || cmd.includes("doctor")) return "#3b82f6";
    if (cmd.includes("review")) return "#8b5cf6";
    if (cmd.includes("init") || cmd.includes("config")) return "#10b981";
    return "#64748b";
  }

  private createCommandSvg(settings: SlashCommandSettings): string {
    const command = settings.command || "/help";
    const label = settings.label || command.replace("/", "");
    const color = this.getCommandColor(command);

    // Truncate label if too long
    const displayLabel = label.length > 8 ? label.slice(0, 7) + "…" : label;

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Command slash icon -->
        <rect x="40" y="40" width="64" height="44" rx="8" fill="${color}" opacity="0.2"/>
        <rect x="40" y="40" width="64" height="44" rx="8" fill="none" stroke="${color}" stroke-width="3"/>

        <!-- Slash symbol -->
        <text x="72" y="72" font-family="monospace" font-size="28" fill="${color}" text-anchor="middle" font-weight="bold">/</text>

        <!-- Label -->
        <text x="72" y="108" font-family="system-ui, sans-serif" font-size="14" fill="${color}" text-anchor="middle" font-weight="bold">${displayLabel}</text>
        <text x="72" y="125" font-family="monospace" font-size="10" fill="#64748b" text-anchor="middle">${command}</text>
      </svg>
    `;
  }
}
