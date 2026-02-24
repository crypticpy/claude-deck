import {
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { claudeAgent } from "../agents/index.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

/**
 * Screenshot to Claude Action - Captures screen and sends path to Claude for analysis
 */
export class ScreenshotClaudeAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.screenshot-claude";

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await this.updateDisplay(ev.action);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      await ev.action.setTitle("📸");

      // Capture screenshot on macOS
      const timestamp = Date.now();
      const screenshotPath = join(
        homedir(),
        ".claude-deck",
        `screenshot-${timestamp}.png`,
      );

      // Use screencapture command (macOS)
      await execFileAsync("screencapture", ["-i", screenshotPath]);

      // Tell Claude to analyze the screenshot
      await claudeAgent.sendText(
        `Please analyze this screenshot: ${screenshotPath}`,
      );

      await ev.action.showOk();
    } catch (error) {
      console.error("Screenshot failed:", error);
      await ev.action.showAlert();
    } finally {
      await this.updateDisplay(ev.action);
    }
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
  ): Promise<void> {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>
        <rect x="38" y="40" width="68" height="50" rx="6" fill="#8b5cf6" opacity="0.2"/>
        <rect x="38" y="40" width="68" height="50" rx="6" fill="none" stroke="#8b5cf6" stroke-width="3"/>
        <!-- Camera lens -->
        <circle cx="72" cy="65" r="15" fill="none" stroke="#8b5cf6" stroke-width="3"/>
        <circle cx="72" cy="65" r="8" fill="#8b5cf6" opacity="0.5"/>
        <!-- Flash -->
        <rect x="85" y="45" width="10" height="6" rx="2" fill="#8b5cf6"/>
        <text x="72" y="115" font-family="system-ui, sans-serif" font-size="11" fill="#8b5cf6" text-anchor="middle" font-weight="bold">CAPTURE</text>
        <text x="72" y="130" font-family="system-ui, sans-serif" font-size="9" fill="#64748b" text-anchor="middle">Screenshot</text>
      </svg>
    `;
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }
}
