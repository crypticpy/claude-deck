import {
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { claudeAgent, type AgentState } from "../agents/index.js";
import { escapeXml } from "../utils/svg-utils.js";

export class PermissionDetailsAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.permission-details";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private updateHandler?: (state: AgentState) => void;

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    await this.updateDisplay(ev.action, claudeAgent.getState());

    if (!this.updateHandler) {
      this.updateHandler = (state: AgentState) => {
        void this.updateAllWithState(state).catch(() => {
          // ignore
        });
      };
      claudeAgent.on("stateChange", this.updateHandler);
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    if (this.activeActions.size === 0 && this.updateHandler) {
      claudeAgent.off("stateChange", this.updateHandler);
      this.updateHandler = undefined;
    }
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
    const pending = state.pendingPermission;
    const hasPending = !!pending;
    const color = hasPending ? "#eab308" : "#64748b";
    const title = hasPending ? (pending?.tool ?? "Permission") : "None";
    const type = hasPending ? (pending?.type ?? "permission") : "—";

    const requestedAt = pending?.requestedAt;
    const ageSeconds = requestedAt
      ? Math.max(0, Math.floor((Date.now() - Date.parse(requestedAt)) / 1000))
      : 0;
    const ageLabel = hasPending
      ? ageSeconds >= 60
        ? `${Math.floor(ageSeconds / 60)}m`
        : `${ageSeconds}s`
      : "";

    const desc = hasPending ? (pending?.description ?? "") : "";

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>
        <text x="72" y="22" font-family="system-ui, sans-serif" font-size="10" fill="#64748b" text-anchor="middle">PERMISSION</text>
        <rect x="16" y="30" width="112" height="58" rx="10" fill="${color}" opacity="0.16"/>
        <rect x="16" y="30" width="112" height="58" rx="10" fill="none" stroke="${color}" stroke-width="3"/>
        <text x="72" y="56" font-family="system-ui, sans-serif" font-size="14" fill="${color}" text-anchor="middle" font-weight="bold">${escapeXml(this.truncate(title, 14))}</text>
        <text x="72" y="74" font-family="monospace" font-size="10" fill="#94a3b8" text-anchor="middle">${escapeXml(this.truncate(type, 18))}${ageLabel ? ` • ${ageLabel}` : ""}</text>
        <text x="72" y="110" font-family="system-ui, sans-serif" font-size="10" fill="#94a3b8" text-anchor="middle">${hasPending ? escapeXml(this.truncate(desc, 22)) : "No pending request"}</text>
        <text x="72" y="130" font-family="system-ui, sans-serif" font-size="9" fill="#64748b" text-anchor="middle">${hasPending ? "Use Approve/Reject" : ""}</text>
      </svg>
    `;

    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private truncate(str: string, max: number): string {
    if (!str) return "";
    return str.length <= max ? str : `${str.slice(0, max - 1)}…`;
  }
}
