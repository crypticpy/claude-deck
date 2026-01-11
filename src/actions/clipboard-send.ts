import { SingletonAction, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { claudeController } from "../utils/claude-controller.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Clipboard Send Action - Sends clipboard contents to Claude
 */
export class ClipboardSendAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.clipboard-send";

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await this.updateDisplay(ev.action);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      await ev.action.setTitle("...");

      // Get clipboard content on macOS
      const { stdout } = await execAsync("pbpaste");
      const clipboardText = stdout.trim();

      if (clipboardText) {
        // Send to Claude (truncate if very long)
        const text = clipboardText.length > 500
          ? clipboardText.slice(0, 500) + "..."
          : clipboardText;
        await claudeController.sendText(text);
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("Clipboard send failed:", error);
      await ev.action.showAlert();
    } finally {
      await this.updateDisplay(ev.action);
    }
  }

  private async updateDisplay(action: WillAppearEvent["action"]): Promise<void> {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>
        <rect x="48" y="35" width="48" height="60" rx="4" fill="#06b6d4" opacity="0.2"/>
        <rect x="48" y="35" width="48" height="60" rx="4" fill="none" stroke="#06b6d4" stroke-width="3"/>
        <rect x="58" y="28" width="28" height="14" rx="2" fill="#06b6d4"/>
        <line x1="58" y1="55" x2="86" y2="55" stroke="#06b6d4" stroke-width="2" opacity="0.5"/>
        <line x1="58" y1="65" x2="86" y2="65" stroke="#06b6d4" stroke-width="2" opacity="0.5"/>
        <line x1="58" y1="75" x2="76" y2="75" stroke="#06b6d4" stroke-width="2" opacity="0.5"/>
        <text x="72" y="115" font-family="system-ui" font-size="11" fill="#06b6d4" text-anchor="middle" font-weight="bold">PASTE</text>
        <text x="72" y="130" font-family="system-ui" font-size="9" fill="#64748b" text-anchor="middle">Clipboard</text>
      </svg>
    `;
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }
}
