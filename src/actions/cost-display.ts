import streamDeck, {
  SingletonAction,
  type DidReceiveSettingsEvent,
  type PropertyInspectorDidAppearEvent,
  type SendToPluginEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import {
  claudeAgent,
  stateAggregator,
  type AgentState,
} from "../agents/index.js";
import type { JsonObject, JsonValue } from "@elgato/utils";

type CostBudgetSettings = JsonObject & {
  budgetUsd?: number;
  autoSwitchFromOpus?: boolean;
  label?: string;
};

type CostBudgetPiMessage = { type: "refresh" };

/**
 * Cost Display Action - Shows estimated API cost for current session
 *
 * Calculates cost based on token usage and model pricing
 */
export class CostDisplayAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.cost-display";

  private updateHandler?: (state: AgentState) => void;
  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private settingsById = new Map<string, CostBudgetSettings>();
  private refreshInterval?: ReturnType<typeof setInterval>;
  private lastAutoSwitchedSessionKey?: string;
  private autoSwitchInFlight = false;

  // Pricing per 1M tokens (as of 2024)
  private readonly pricing: Record<string, { input: number; output: number }> =
    {
      opus: { input: 15.0, output: 75.0 },
      sonnet: { input: 3.0, output: 15.0 },
      haiku: { input: 0.25, output: 1.25 },
    };

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    this.settingsById.set(
      ev.action.id,
      (ev.payload.settings as CostBudgetSettings) ?? {},
    );
    await this.updateDisplay(ev.action, claudeAgent.getState());

    if (!this.updateHandler) {
      this.updateHandler = (state: AgentState) => {
        void this.maybeAutoSwitchModel(state).catch(() => {
          // ignore
        });
        void this.updateAllWithState(state).catch(() => {
          // ignore
        });
      };
      claudeAgent.on("stateChange", this.updateHandler);
    }

    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(() => {
        void this.updateAll().catch(() => {
          // ignore
        });
      }, 3000);
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    this.settingsById.delete(ev.action.id);
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
    await this.updateAllWithState(claudeAgent.getState());
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent,
  ): Promise<void> {
    this.settingsById.set(
      ev.action.id,
      (ev.payload.settings as CostBudgetSettings) ?? {},
    );
    await this.updateDisplay(ev.action, claudeAgent.getState());
  }

  override async onPropertyInspectorDidAppear(
    ev: PropertyInspectorDidAppearEvent,
  ): Promise<void> {
    await streamDeck.ui.sendToPropertyInspector({
      settings: this.getSettings(ev.action.id),
    } as unknown as JsonValue);
  }

  override async onSendToPlugin(
    ev: SendToPluginEvent<CostBudgetPiMessage, CostBudgetSettings>,
  ): Promise<void> {
    const payload = ev.payload as CostBudgetPiMessage;
    if (payload?.type === "refresh") {
      await streamDeck.ui.sendToPropertyInspector({
        settings: this.getSettings(ev.action.id),
      } as unknown as JsonValue);
    }
  }

  private getSettings(actionId: string): CostBudgetSettings {
    const stored = this.settingsById.get(actionId) ?? {};
    return {
      budgetUsd: stored.budgetUsd,
      autoSwitchFromOpus: stored.autoSwitchFromOpus ?? false,
      label: stored.label ?? "Session Cost",
    };
  }

  private async updateAllWithState(state: AgentState): Promise<void> {
    await Promise.allSettled(
      [...this.activeActions.values()].map((action) =>
        this.updateDisplay(action, state),
      ),
    );
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
    state: AgentState,
  ): Promise<void> {
    const settings = this.getSettings(action.id);
    const svg = this.createCostSvg(state, settings);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private getCost(state: AgentState): number {
    // Use actual session cost from Claude's context stats if available
    if (state.cost !== undefined && state.cost > 0) {
      return state.cost;
    }
    // Fallback: estimate from tokens
    const tokens = state.tokens || { input: 0, output: 0 };
    const model = state.model || "sonnet";
    const prices = this.pricing[model] || this.pricing.sonnet;
    return (
      (tokens.input / 1_000_000) * prices.input +
      (tokens.output / 1_000_000) * prices.output
    );
  }

  private formatCost(cost: number): string {
    if (cost < 0.01) return "<$0.01";
    if (cost < 1) return `$${cost.toFixed(2)}`;
    return `$${cost.toFixed(2)}`;
  }

  private createCostSvg(
    state: AgentState,
    settings: CostBudgetSettings,
  ): string {
    const total = this.getCost(state);
    const tokens = state.tokens || { input: 0, output: 0 };
    const totalTokens = tokens.input + tokens.output;
    const budget = settings.budgetUsd;

    // Color based on cost
    let costColor = "#22c55e"; // Green for cheap
    if (total > 1.0) costColor = "#eab308"; // Yellow for moderate
    if (total > 5.0) costColor = "#f97316"; // Orange for expensive
    if (total > 15.0) costColor = "#ef4444"; // Red for very expensive

    // Format tokens as K
    const tokensK =
      totalTokens > 0 ? `${Math.round(totalTokens / 1000)}K` : "0";

    const pctOfBudget =
      budget && budget > 0 ? Math.min(1, total / budget) : null;
    const budgetLine =
      budget && budget > 0
        ? `${this.formatCost(total)} / $${budget.toFixed(2)}`
        : this.formatCost(total);
    const budgetStatus =
      budget && budget > 0 ? `${Math.round((pctOfBudget ?? 0) * 100)}%` : "";

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Title -->
        <text x="72" y="22" font-family="system-ui, sans-serif" font-size="10" fill="#64748b" text-anchor="middle">${(settings.label ?? "SESSION COST").toUpperCase()}</text>

        <!-- Main cost display -->
        <text x="72" y="62" font-family="system-ui, sans-serif" font-size="22" fill="${costColor}" text-anchor="middle" font-weight="bold">${budgetLine}</text>
        ${
          pctOfBudget !== null
            ? `
          <rect x="20" y="72" width="104" height="10" rx="5" fill="#1e293b"/>
          <rect x="20" y="72" width="${Math.max(2, Math.round(104 * pctOfBudget))}" height="10" rx="5" fill="${costColor}"/>
          <text x="72" y="96" font-family="monospace" font-size="10" fill="#94a3b8" text-anchor="middle">${budgetStatus} of budget</text>
        `
            : `
          <text x="72" y="92" font-family="system-ui, sans-serif" font-size="12" fill="#94a3b8" text-anchor="middle">${tokensK} tokens</text>
        `
        }

        <!-- Model indicator -->
        <text x="72" y="125" font-family="system-ui, sans-serif" font-size="11" fill="#475569" text-anchor="middle">${(state.model || "sonnet").toUpperCase()}</text>
      </svg>
    `;
  }

  private async maybeAutoSwitchModel(state: AgentState): Promise<void> {
    if (this.activeActions.size === 0) return;
    if (state.status === "disconnected") return;

    const any = [...this.settingsById.values()];
    const enabled = any.some(
      (s) =>
        s.autoSwitchFromOpus &&
        typeof s.budgetUsd === "number" &&
        s.budgetUsd > 0,
    );
    if (!enabled) return;

    const budget = Math.max(
      ...any.map((s) => (typeof s.budgetUsd === "number" ? s.budgetUsd : 0)),
    );
    if (!budget || budget <= 0) return;

    if ((state.model ?? "sonnet") !== "opus") return;

    const cost = this.getCost(state);
    if (cost < budget) return;

    const sessionKey = state.sessionStartTime ?? "unknown";
    if (this.lastAutoSwitchedSessionKey === sessionKey) return;
    if (this.autoSwitchInFlight) return;

    const focused = await claudeAgent.isTerminalFocused();
    if (!focused) return;

    this.autoSwitchInFlight = true;
    try {
      const ok = await stateAggregator.cycleModel();
      if (ok) this.lastAutoSwitchedSessionKey = sessionKey;
    } catch (err) {
      streamDeck.logger.debug("Auto-switch model failed:", err);
    } finally {
      this.autoSwitchInFlight = false;
    }
  }
}
