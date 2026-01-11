import { SingletonAction, type KeyDownEvent, type WillAppearEvent } from "@elgato/streamdeck";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";

const execAsync = promisify(exec);

/**
 * Session Export Action - Exports current session transcript
 */
export class SessionExportAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.session-export";

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    await this.updateDisplay(ev.action);
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      await ev.action.setTitle("...");

      // Find most recent transcript
      const { stdout: transcriptPath } = await execAsync(
        `find ~/.claude/projects -name "*.jsonl" -mmin -60 2>/dev/null | head -1`
      );

      if (transcriptPath.trim()) {
        // Copy to exports folder with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const exportDir = join(homedir(), ".claude-deck", "exports");
        const exportPath = join(exportDir, `session-${timestamp}.jsonl`);

        await execAsync(`mkdir -p "${exportDir}"`);
        await execAsync(`cp "${transcriptPath.trim()}" "${exportPath}"`);

        // Also create a readable version
        const readablePath = exportPath.replace(".jsonl", ".txt");
        await execAsync(`cat "${transcriptPath.trim()}" | jq -r '.content // .message // empty' > "${readablePath}" 2>/dev/null || true`);

        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("Export failed:", error);
      await ev.action.showAlert();
    } finally {
      await this.updateDisplay(ev.action);
    }
  }

  private async updateDisplay(action: WillAppearEvent["action"]): Promise<void> {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>
        <!-- Document icon -->
        <path d="M50 35 L80 35 L95 50 L95 100 L50 100 Z" fill="#10b981" opacity="0.2"/>
        <path d="M50 35 L80 35 L95 50 L95 100 L50 100 Z" fill="none" stroke="#10b981" stroke-width="3"/>
        <path d="M80 35 L80 50 L95 50" fill="none" stroke="#10b981" stroke-width="3"/>
        <!-- Arrow down -->
        <path d="M72 60 L72 85 M60 75 L72 87 L84 75" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="72" y="115" font-family="system-ui" font-size="11" fill="#10b981" text-anchor="middle" font-weight="bold">EXPORT</text>
        <text x="72" y="130" font-family="system-ui" font-size="9" fill="#64748b" text-anchor="middle">Session</text>
      </svg>
    `;
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }
}
