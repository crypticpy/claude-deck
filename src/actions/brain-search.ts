import { SingletonAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { claudeController, type ClaudeState } from "../utils/claude-controller.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Brain Search Action - Searches context-layer brain for lessons and insights
 *
 * Tap: Search for recent lessons
 * Long press: Search all sources
 */
export class BrainSearchAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.brain-search";

  private updateHandler?: (state: ClaudeState) => void;
  private currentAction?: WillAppearEvent["action"];
  private refreshInterval?: ReturnType<typeof setInterval>;
  private lastSearchResult?: string;

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.currentAction = ev.action;
    await this.updateDisplay(ev.action);

    this.updateHandler = async () => {
      if (this.currentAction) {
        await this.updateDisplay(this.currentAction);
      }
    };
    claudeController.on("stateChange", this.updateHandler);

    this.refreshInterval = setInterval(() => {
      if (this.currentAction) {
        this.updateDisplay(this.currentAction);
      }
    }, 5000);

    // Load brain stats on appear
    this.loadBrainStats();
  }

  override async onWillDisappear(_ev: WillDisappearEvent): Promise<void> {
    this.currentAction = undefined;
    if (this.updateHandler) {
      claudeController.off("stateChange", this.updateHandler);
      this.updateHandler = undefined;
    }
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      await ev.action.setTitle("...");

      // Send brain search command to Claude
      await claudeController.sendText("Search my brain for recent lessons and hot files");

      await ev.action.showOk();
    } catch (error) {
      console.error("Brain search failed:", error);
      await ev.action.showAlert();
    }
  }

  private async loadBrainStats(): Promise<void> {
    try {
      // Try to read brain stats from context-layer
      const { stdout } = await execAsync(
        `mcp-cli call context-layer/brain_search '{"query": "recent", "sources": ["lessons", "hot-files"]}' 2>/dev/null | head -5`
      );
      this.lastSearchResult = stdout.trim();
    } catch {
      // MCP not available, that's ok
    }
  }

  private async updateDisplay(action: WillAppearEvent["action"]): Promise<void> {
    const svg = this.createBrainSvg();
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private createBrainSvg(): string {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Brain icon -->
        <ellipse cx="72" cy="60" rx="35" ry="30" fill="#a855f7" opacity="0.2"/>
        <path d="M50 60 Q50 40 72 40 Q94 40 94 60 Q94 80 72 85 Q50 80 50 60"
              fill="none" stroke="#a855f7" stroke-width="3"/>
        <path d="M72 40 Q72 60 72 85" stroke="#a855f7" stroke-width="2" opacity="0.5"/>
        <path d="M55 50 Q65 55 55 65" stroke="#a855f7" stroke-width="2" fill="none"/>
        <path d="M89 50 Q79 55 89 65" stroke="#a855f7" stroke-width="2" fill="none"/>

        <!-- Sparkles -->
        <circle cx="45" cy="45" r="3" fill="#a855f7" opacity="0.6"/>
        <circle cx="99" cy="45" r="2" fill="#a855f7" opacity="0.4"/>
        <circle cx="40" cy="70" r="2" fill="#a855f7" opacity="0.5"/>

        <!-- Label -->
        <text x="72" y="115" font-family="system-ui, sans-serif" font-size="11" fill="#a855f7" text-anchor="middle" font-weight="bold">BRAIN</text>
        <text x="72" y="130" font-family="system-ui, sans-serif" font-size="9" fill="#64748b" text-anchor="middle">Search Memory</text>
      </svg>
    `;
  }
}
