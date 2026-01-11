import { SingletonAction, type KeyDownEvent, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { claudeController, type ClaudeState } from "../utils/claude-controller.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Git Status Action - Shows current branch and uncommitted changes
 */
export class GitStatusAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.git-status";

  private currentAction?: WillAppearEvent["action"];
  private refreshInterval?: ReturnType<typeof setInterval>;
  private gitData: { branch: string; changes: number; ahead: number; behind: number } = {
    branch: "main",
    changes: 0,
    ahead: 0,
    behind: 0,
  };

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.currentAction = ev.action;
    await this.loadGitStatus();
    await this.updateDisplay(ev.action);

    // Refresh git status every 10 seconds
    this.refreshInterval = setInterval(async () => {
      if (this.currentAction) {
        await this.loadGitStatus();
        await this.updateDisplay(this.currentAction);
      }
    }, 10000);
  }

  override async onWillDisappear(_ev: WillDisappearEvent): Promise<void> {
    this.currentAction = undefined;
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      // Refresh git status
      await this.loadGitStatus();
      await this.updateDisplay(ev.action);
      await ev.action.showOk();
    } catch {
      await ev.action.showAlert();
    }
  }

  private async loadGitStatus(): Promise<void> {
    try {
      // Get current branch
      const { stdout: branch } = await execAsync("git branch --show-current 2>/dev/null || echo 'N/A'");
      this.gitData.branch = branch.trim() || "N/A";

      // Get number of changed files
      try {
        const { stdout: changes } = await execAsync("git status --porcelain 2>/dev/null | wc -l");
        this.gitData.changes = parseInt(changes.trim()) || 0;
      } catch {
        this.gitData.changes = 0;
      }

      // Get ahead/behind counts
      try {
        const { stdout: status } = await execAsync("git status -sb 2>/dev/null | head -1");
        const aheadMatch = status.match(/ahead (\d+)/);
        const behindMatch = status.match(/behind (\d+)/);
        this.gitData.ahead = aheadMatch ? parseInt(aheadMatch[1]) : 0;
        this.gitData.behind = behindMatch ? parseInt(behindMatch[1]) : 0;
      } catch {
        this.gitData.ahead = 0;
        this.gitData.behind = 0;
      }
    } catch {
      // Not in a git repo
      this.gitData.branch = "N/A";
      this.gitData.changes = 0;
    }
  }

  private async updateDisplay(action: WillAppearEvent["action"]): Promise<void> {
    const svg = this.createGitSvg();
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private createGitSvg(): string {
    const { branch, changes, ahead, behind } = this.gitData;
    const hasChanges = changes > 0;
    const branchColor = hasChanges ? "#f97316" : "#22c55e";

    // Truncate branch name if too long
    const displayBranch = branch.length > 10 ? branch.slice(0, 9) + "…" : branch;

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Git branch icon -->
        <circle cx="50" cy="45" r="8" fill="none" stroke="${branchColor}" stroke-width="3"/>
        <circle cx="94" cy="45" r="8" fill="none" stroke="${branchColor}" stroke-width="3"/>
        <circle cx="72" cy="80" r="8" fill="none" stroke="${branchColor}" stroke-width="3"/>
        <path d="M50 53 L50 65 Q50 72 57 72 L65 72" stroke="${branchColor}" stroke-width="3" fill="none"/>
        <path d="M94 53 L94 65 Q94 72 87 72 L79 72" stroke="${branchColor}" stroke-width="3" fill="none"/>

        <!-- Branch name -->
        <text x="72" y="105" font-family="monospace" font-size="12" fill="${branchColor}" text-anchor="middle" font-weight="bold">${displayBranch}</text>

        <!-- Changes count -->
        ${hasChanges ? `
          <rect x="85" y="110" width="28" height="18" rx="4" fill="#f97316"/>
          <text x="99" y="123" font-family="system-ui, sans-serif" font-size="11" fill="#ffffff" text-anchor="middle" font-weight="bold">${changes}</text>
        ` : ""}

        <!-- Ahead/Behind indicators -->
        ${ahead > 0 ? `<text x="30" y="130" font-family="system-ui, sans-serif" font-size="10" fill="#22c55e">↑${ahead}</text>` : ""}
        ${behind > 0 ? `<text x="114" y="130" font-family="system-ui, sans-serif" font-size="10" fill="#ef4444" text-anchor="end">↓${behind}</text>` : ""}
      </svg>
    `;
  }
}
