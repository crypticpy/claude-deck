import { SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { claudeController, type ClaudeState } from "../utils/claude-controller.js";

/**
 * Cost Display Action - Shows estimated API cost for current session
 *
 * Calculates cost based on token usage and model pricing
 */
export class CostDisplayAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.cost-display";

  private updateHandler?: (state: ClaudeState) => void;
  private currentAction?: WillAppearEvent["action"];
  private refreshInterval?: ReturnType<typeof setInterval>;

  // Pricing per 1M tokens (as of 2024)
  private readonly pricing: Record<string, { input: number; output: number }> = {
    opus: { input: 15.00, output: 75.00 },
    sonnet: { input: 3.00, output: 15.00 },
    haiku: { input: 0.25, output: 1.25 },
  };

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
    }, 3000);
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

  private async updateDisplay(action: WillAppearEvent["action"]): Promise<void> {
    const state = claudeController.getState();
    const svg = this.createCostSvg(state);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private getCost(state: ClaudeState): number {
    // Use actual session cost from Claude's context stats if available
    if (state.sessionCost !== undefined && state.sessionCost > 0) {
      return state.sessionCost;
    }
    // Fallback: estimate from tokens
    const tokens = state.tokens || { input: 0, output: 0 };
    const model = state.currentModel || "sonnet";
    const prices = this.pricing[model] || this.pricing.sonnet;
    return ((tokens.input / 1_000_000) * prices.input) + ((tokens.output / 1_000_000) * prices.output);
  }

  private formatCost(cost: number): string {
    if (cost < 0.01) return "<$0.01";
    if (cost < 1) return `$${cost.toFixed(2)}`;
    return `$${cost.toFixed(2)}`;
  }

  private createCostSvg(state: ClaudeState): string {
    const total = this.getCost(state);
    const tokens = state.tokens || { input: 0, output: 0 };
    const totalTokens = tokens.input + tokens.output;

    // Color based on cost
    let costColor = "#22c55e"; // Green for cheap
    if (total > 1.00) costColor = "#eab308"; // Yellow for moderate
    if (total > 5.00) costColor = "#f97316"; // Orange for expensive
    if (total > 15.00) costColor = "#ef4444"; // Red for very expensive

    // Format tokens as K
    const tokensK = totalTokens > 0 ? `${Math.round(totalTokens / 1000)}K` : "0";

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Title -->
        <text x="72" y="28" font-family="system-ui, sans-serif" font-size="12" fill="#64748b" text-anchor="middle">SESSION COST</text>

        <!-- Main cost display -->
        <text x="72" y="70" font-family="system-ui, sans-serif" font-size="28" fill="${costColor}" text-anchor="middle" font-weight="bold">${this.formatCost(total)}</text>

        <!-- Token count -->
        <text x="72" y="100" font-family="system-ui, sans-serif" font-size="12" fill="#94a3b8" text-anchor="middle">${tokensK} tokens</text>

        <!-- Model indicator -->
        <text x="72" y="125" font-family="system-ui, sans-serif" font-size="11" fill="#475569" text-anchor="middle">${(state.currentModel || "sonnet").toUpperCase()}</text>
      </svg>
    `;
  }
}
