import {
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { claudeAgent } from "../agents/index.js";

/**
 * Token Display Action - Shows current token usage on the button
 *
 * Displays:
 * - Input tokens
 * - Output tokens
 * - Total tokens
 * - Cost estimate
 */
export class TokenDisplayAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.token-display";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private updateHandler?: () => void;
  private refreshInterval?: ReturnType<typeof setInterval>;

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    await this.updateDisplay(ev.action);

    if (!this.updateHandler) {
      this.updateHandler = () => {
        void this.updateAll().catch(() => {
          // ignore
        });
      };
      claudeAgent.on("stateChange", this.updateHandler);
    }

    // Also poll every 2 seconds for token updates
    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(() => {
        void this.updateAll().catch(() => {
          // ignore
        });
      }, 2000);
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);

    if (this.activeActions.size === 0 && this.updateHandler) {
      claudeAgent.off("stateChange", this.updateHandler);
      this.updateHandler = undefined;
    }
    if (this.activeActions.size === 0 && this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }

  private async updateAll(): Promise<void> {
    if (this.activeActions.size === 0) return;
    await Promise.allSettled(
      [...this.activeActions.values()].map((action) =>
        this.updateDisplay(action),
      ),
    );
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
  ): Promise<void> {
    const state = claudeAgent.getState();
    const tokens = state.tokens || { input: 0, output: 0 };
    const total = tokens.input + tokens.output;

    // Format token count (e.g., 12.5K)
    const formatTokens = (n: number): string => {
      if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
      if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
      return n.toString();
    };

    // Create SVG with token info
    const svg = this.createTokenSvg(
      formatTokens(tokens.input),
      formatTokens(tokens.output),
      formatTokens(total),
    );

    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private createTokenSvg(input: string, output: string, total: string): string {
    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#1a1a2e" rx="12"/>

        <!-- Title -->
        <text x="72" y="28" font-family="system-ui, sans-serif" font-size="14" fill="#888" text-anchor="middle">TOKENS</text>

        <!-- Input -->
        <text x="24" y="58" font-family="system-ui, sans-serif" font-size="11" fill="#4ade80">IN</text>
        <text x="120" y="58" font-family="system-ui, sans-serif" font-size="16" fill="#4ade80" text-anchor="end" font-weight="bold">${input}</text>

        <!-- Output -->
        <text x="24" y="82" font-family="system-ui, sans-serif" font-size="11" fill="#f472b6">OUT</text>
        <text x="120" y="82" font-family="system-ui, sans-serif" font-size="16" fill="#f472b6" text-anchor="end" font-weight="bold">${output}</text>

        <!-- Divider -->
        <line x1="24" y1="94" x2="120" y2="94" stroke="#333" stroke-width="1"/>

        <!-- Total -->
        <text x="24" y="116" font-family="system-ui, sans-serif" font-size="11" fill="#fff">TOTAL</text>
        <text x="120" y="116" font-family="system-ui, sans-serif" font-size="18" fill="#fff" text-anchor="end" font-weight="bold">${total}</text>
      </svg>
    `;
  }
}
