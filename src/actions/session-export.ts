import {
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { svgToDataUri } from "../utils/svg-utils.js";

const execFileAsync = promisify(execFile);

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
      const projectsDir = join(homedir(), ".claude", "projects");
      const { stdout } = await execFileAsync("find", [
        projectsDir,
        "-name",
        "*.jsonl",
        "-mmin",
        "-60",
        "-print",
      ]);
      const candidates = stdout.split("\n").filter(Boolean);

      let transcriptPath = "";
      let newestMtime = 0;
      for (const candidate of candidates) {
        try {
          const s = await stat(candidate);
          if (s.mtimeMs > newestMtime) {
            newestMtime = s.mtimeMs;
            transcriptPath = candidate;
          }
        } catch {
          // ignore unreadable candidates
        }
      }

      if (transcriptPath) {
        // Copy to exports folder with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const exportDir = join(homedir(), ".claude-deck", "exports");
        const exportPath = join(exportDir, `session-${timestamp}.jsonl`);

        await mkdir(exportDir, { recursive: true });
        await copyFile(transcriptPath, exportPath);

        // Also create a readable version
        const readablePath = exportPath.replace(".jsonl", ".txt");
        const rl = createInterface({
          input: createReadStream(transcriptPath),
          crlfDelay: Infinity,
        });
        const lines: string[] = [];
        for await (const line of rl) {
          try {
            const obj = JSON.parse(line) as Record<string, unknown>;
            const msg = obj.content ?? obj.message;
            if (typeof msg === "string" && msg.trim()) lines.push(msg.trim());
          } catch {
            // ignore malformed lines
          }
        }
        rl.close();
        await writeFile(readablePath, lines.join("\n\n"));

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

  private async updateDisplay(
    action: WillAppearEvent["action"],
  ): Promise<void> {
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
    await action.setImage(svgToDataUri(svg));
  }
}
