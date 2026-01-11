import { SingletonAction, type KeyDownEvent, type WillAppearEvent, type DidReceiveSettingsEvent } from "@elgato/streamdeck";
import { claudeController } from "../utils/claude-controller.js";

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

  private settings: SlashCommandSettings = { command: "/help", label: "Help" };

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.settings = (ev.payload.settings as SlashCommandSettings) || { command: "/help", label: "Help" };
    await this.updateDisplay(ev.action);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent): Promise<void> {
    this.settings = (ev.payload.settings as SlashCommandSettings) || this.settings;
    await this.updateDisplay(ev.action);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      const command = this.settings.command || "/help";
      await ev.action.setTitle("...");

      // Send the slash command to Claude
      const success = await claudeController.sendText(command);

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
    const svg = this.createCommandSvg();
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private getCommandColor(): string {
    const cmd = (this.settings.command || "").toLowerCase();
    if (cmd.includes("commit")) return "#f59e0b";
    if (cmd.includes("clear") || cmd.includes("compact")) return "#ef4444";
    if (cmd.includes("help") || cmd.includes("doctor")) return "#3b82f6";
    if (cmd.includes("review")) return "#8b5cf6";
    if (cmd.includes("init") || cmd.includes("config")) return "#10b981";
    return "#64748b";
  }

  private createCommandSvg(): string {
    const command = this.settings.command || "/help";
    const label = this.settings.label || command.replace("/", "");
    const color = this.getCommandColor();

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
