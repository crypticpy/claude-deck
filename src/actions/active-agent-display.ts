/**
 * Active Agent Display - Shows the currently focused/active agent
 *
 * This display action provides visual feedback about which AI coding agent
 * is currently active. It updates automatically when terminal focus changes.
 *
 * Features:
 * - Shows agent name and color-coded badge
 * - Updates in real-time on focus change
 * - Displays agent status (working/idle/waiting)
 * - Pressing switches to next agent
 */

import {
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import {
  stateAggregator,
  AGENT_COLORS,
  STATUS_COLORS,
  type AggregatedState,
} from "../agents/index.js";
import { escapeXml } from "../utils/svg-utils.js";

export class ActiveAgentDisplayAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.active-agent-display";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private stateHandler?: (state: AggregatedState) => void;
  private activeChangeHandler?: (
    agentId: string | null,
    previousId: string | null,
  ) => void;

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    await this.updateDisplay(ev.action);

    if (!this.stateHandler) {
      this.stateHandler = () => {
        void this.updateAllDisplays().catch(() => {});
      };
      stateAggregator.on("stateChange", this.stateHandler);
    }

    if (!this.activeChangeHandler) {
      this.activeChangeHandler = () => {
        void this.updateAllDisplays().catch(() => {});
      };
      stateAggregator.on("activeAgentChange", this.activeChangeHandler);
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);

    if (this.activeActions.size === 0) {
      if (this.stateHandler) {
        stateAggregator.off("stateChange", this.stateHandler);
        this.stateHandler = undefined;
      }
      if (this.activeChangeHandler) {
        stateAggregator.off("activeAgentChange", this.activeChangeHandler);
        this.activeChangeHandler = undefined;
      }
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    // Cycle to next agent
    const agentIds = stateAggregator.getAgentIds();
    const currentId = stateAggregator.getActiveAgentId();
    const currentIndex = currentId ? agentIds.indexOf(currentId) : -1;
    const nextIndex = (currentIndex + 1) % agentIds.length;
    const nextAgentId = agentIds[nextIndex];

    if (nextAgentId) {
      const nextAgent = stateAggregator.getAgent(nextAgentId);
      if (nextAgent) {
        stateAggregator.setActiveAgent(nextAgentId);
        await nextAgent.focusTerminal();
        await ev.action.showOk();
      }
    }
  }

  private async updateAllDisplays(): Promise<void> {
    await Promise.allSettled(
      [...this.activeActions.values()].map((action) =>
        this.updateDisplay(action),
      ),
    );
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
  ): Promise<void> {
    const activeAgentId = stateAggregator.getActiveAgentId();
    const agent = activeAgentId
      ? stateAggregator.getAgent(activeAgentId)
      : null;
    const state = activeAgentId
      ? stateAggregator.getAgentState(activeAgentId)
      : null;

    if (!agent || !state) {
      await action.setTitle("No Agent");
      await action.setImage(this.generateNoAgentSvg());
      return;
    }

    const agentColor = AGENT_COLORS[agent.id] ?? {
      primary: "#888888",
      muted: "#444444",
    };
    const statusColor = STATUS_COLORS[state.status] ?? STATUS_COLORS.idle;

    const svg = this.generateAgentSvg(
      agent.name,
      agentColor.primary,
      statusColor,
      state.status,
      state.model,
    );

    await action.setTitle("");
    await action.setImage(
      `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    );
  }

  private generateAgentSvg(
    name: string,
    agentColor: string,
    statusColor: string,
    status: string,
    model?: string,
  ): string {
    const statusText = status.charAt(0).toUpperCase() + status.slice(1);
    const modelText = model ? this.formatModelName(model) : "";

    return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <defs>
    <filter id="glow">
      <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="144" height="144" fill="#0f172a" rx="12"/>
  <!-- Agent badge circle -->
  <circle cx="72" cy="50" r="28" fill="${agentColor}" opacity="0.3"/>
  <circle cx="72" cy="50" r="28" fill="none" stroke="${agentColor}" stroke-width="3" filter="url(#glow)"/>
  <!-- Status indicator -->
  <circle cx="100" cy="30" r="8" fill="${statusColor}"/>
  <!-- Agent name -->
  <text x="72" y="100" font-family="system-ui" font-size="14" font-weight="bold" fill="${agentColor}" text-anchor="middle">${escapeXml(name)}</text>
  <!-- Status text -->
  <text x="72" y="118" font-family="system-ui" font-size="11" fill="#9ca3af" text-anchor="middle">${escapeXml(statusText)}${modelText ? ` • ${escapeXml(modelText)}` : ""}</text>
  <!-- Active indicator -->
  <text x="72" y="56" font-family="system-ui" font-size="20" font-weight="bold" fill="${agentColor}" text-anchor="middle">●</text>
</svg>`;
  }

  private generateNoAgentSvg(): string {
    return `data:image/svg+xml;base64,${Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="#0f172a" rx="12"/>
  <circle cx="72" cy="50" r="28" fill="#374151" opacity="0.3"/>
  <circle cx="72" cy="50" r="28" fill="none" stroke="#374151" stroke-width="2" stroke-dasharray="4 4"/>
  <text x="72" y="56" font-family="system-ui" font-size="20" fill="#6b7280" text-anchor="middle">?</text>
  <text x="72" y="100" font-family="system-ui" font-size="12" fill="#6b7280" text-anchor="middle">No Agent</text>
  <text x="72" y="118" font-family="system-ui" font-size="10" fill="#4b5563" text-anchor="middle">Press to select</text>
</svg>`,
    ).toString("base64")}`;
  }

  private formatModelName(model: string): string {
    const lower = model.toLowerCase();
    if (lower.includes("opus")) return "Opus";
    if (lower.includes("sonnet")) return "Sonnet";
    if (lower.includes("haiku")) return "Haiku";
    if (lower.includes("gpt-4")) return "GPT-4";
    if (lower.includes("gpt-5")) return "GPT-5";
    return model.split(/[-_]/)[0];
  }
}
