import streamDeck, {
  SingletonAction,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type PropertyInspectorDidAppearEvent,
  type SendToPluginEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { claudeAgent, type AgentState } from "../agents/index.js";
import type { JsonObject, JsonValue } from "@elgato/utils";
import { escapeXml } from "../utils/svg-utils.js";

type ContextAutoCompactSettings = JsonObject & {
  thresholdPercent?: number;
  autoSend?: boolean;
  command?: string;
  label?: string;
};

type ContextAutoCompactPiMessage = { type: "refresh" };

export class ContextAutoCompactAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.context-auto-compact";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private settingsById = new Map<string, ContextAutoCompactSettings>();
  private updateHandler?: (state: AgentState) => void;
  private lastAutoSentSessionStart?: string;
  private autoSendInFlight = false;

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    this.settingsById.set(
      ev.action.id,
      (ev.payload.settings as ContextAutoCompactSettings) ?? {},
    );
    await this.updateDisplay(ev.action, claudeAgent.getState());

    if (!this.updateHandler) {
      this.updateHandler = (state: AgentState) => {
        void this.maybeAutoSend(state).catch(() => {
          // ignore
        });
        void this.updateAllWithState(state).catch(() => {
          // ignore
        });
      };
      claudeAgent.on("stateChange", this.updateHandler);
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    this.settingsById.delete(ev.action.id);

    if (this.activeActions.size === 0 && this.updateHandler) {
      claudeAgent.off("stateChange", this.updateHandler);
      this.updateHandler = undefined;
    }
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent,
  ): Promise<void> {
    this.settingsById.set(
      ev.action.id,
      (ev.payload.settings as ContextAutoCompactSettings) ?? {},
    );
    await this.updateDisplay(ev.action, claudeAgent.getState());
  }

  override async onPropertyInspectorDidAppear(
    ev: PropertyInspectorDidAppearEvent,
  ): Promise<void> {
    await streamDeck.ui.sendToPropertyInspector(this.getPiState(ev.action.id));
  }

  override async onSendToPlugin(
    ev: SendToPluginEvent<
      ContextAutoCompactPiMessage,
      ContextAutoCompactSettings
    >,
  ): Promise<void> {
    const payload = ev.payload as ContextAutoCompactPiMessage;
    if (payload?.type === "refresh") {
      await streamDeck.ui.sendToPropertyInspector(
        this.getPiState(ev.action.id),
      );
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const settings = this.getSettings(ev.action.id);
    const command = settings.command?.trim() || "/compact";

    try {
      await ev.action.setTitle("...");
      const ok = await claudeAgent.sendText(command);
      if (ok) await ev.action.showOk();
      else await ev.action.showAlert();
    } catch (error) {
      streamDeck.logger.error("ContextAutoCompactAction send failed:", error);
      await ev.action.showAlert();
    } finally {
      await this.updateDisplay(ev.action, claudeAgent.getState());
    }
  }

  private getSettings(actionId: string): ContextAutoCompactSettings {
    const stored = this.settingsById.get(actionId) ?? {};
    return {
      thresholdPercent: 77,
      autoSend: false,
      command: "/compact",
      label: "Compact",
      ...stored,
    };
  }

  private getPiState(actionId: string): JsonValue {
    const settings = this.getSettings(actionId);
    return {
      settings,
      note: "Auto-send triggers only when terminal is focused.",
    } as unknown as JsonValue;
  }

  private async maybeAutoSend(state: AgentState): Promise<void> {
    if (this.activeActions.size === 0) return;

    const anySettings = [...this.settingsById.values()];
    const threshold = Math.max(
      ...anySettings.map((s) => s.thresholdPercent ?? 77),
      0,
    );
    const autoSendEnabled = anySettings.some((s) => s.autoSend);
    const command = (
      anySettings.find((s) => s.command?.trim())?.command ?? "/compact"
    ).trim();

    if (!autoSendEnabled) return;
    if (state.status === "disconnected") return;
    if ((state.contextPercent ?? 0) < threshold) return;

    const sessionKey = state.sessionStartTime ?? "unknown";
    if (sessionKey && this.lastAutoSentSessionStart === sessionKey) return;
    if (this.autoSendInFlight) return;

    const focused = await claudeAgent.isTerminalFocused();
    if (!focused) return;

    this.autoSendInFlight = true;
    try {
      const ok = await claudeAgent.sendText(command);
      if (ok) this.lastAutoSentSessionStart = sessionKey;
    } finally {
      this.autoSendInFlight = false;
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
    const settings = this.getSettings(action.id);
    const percent = Math.round(state.contextPercent ?? 0);
    const threshold = settings.thresholdPercent ?? 77;

    const over = percent >= threshold;
    const color = over
      ? "#ef4444"
      : percent >= threshold - 10
        ? "#eab308"
        : "#22c55e";
    const label = (settings.label ?? "Compact").toUpperCase();

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>
        <text x="72" y="22" font-family="system-ui, sans-serif" font-size="10" fill="#64748b" text-anchor="middle">${escapeXml(label)}</text>

        <circle cx="72" cy="66" r="42" fill="${color}" opacity="0.14"/>
        <circle cx="72" cy="66" r="42" fill="none" stroke="${color}" stroke-width="4"/>
        <text x="72" y="72" font-family="system-ui, sans-serif" font-size="28" fill="${color}" text-anchor="middle" font-weight="bold">${percent}%</text>

        <text x="72" y="104" font-family="monospace" font-size="10" fill="#94a3b8" text-anchor="middle">THRESH ${threshold}%</text>
        <text x="72" y="126" font-family="system-ui, sans-serif" font-size="10" fill="${over ? color : "#64748b"}" text-anchor="middle">${over ? "Tap to /compact" : "Watching…"}</text>
      </svg>
    `;

    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }
}
