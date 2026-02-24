import streamDeck, {
  SingletonAction,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type SendToPluginEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import {
  claudeAgent,
  terminalDetector,
  type TerminalType,
} from "../agents/index.js";
import type { JsonObject, JsonValue } from "@elgato/utils";

type TerminalTargetSettings = JsonObject & {
  terminalType?: TerminalType;
};

type TerminalTargetPiMessage =
  | { type: "refresh" }
  | { type: "focus" }
  | { type: "setTerminalType"; terminalType: TerminalType };

export class TerminalTargetAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.terminal-target";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private refreshInterval?: ReturnType<typeof setInterval>;

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);

    const settings = (ev.payload.settings as TerminalTargetSettings) ?? {};
    if (settings.terminalType) {
      claudeAgent.setTerminalType(settings.terminalType);
    }

    await this.updateDisplay(ev.action);

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
    if (this.activeActions.size === 0 && this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent,
  ): Promise<void> {
    const settings = (ev.payload.settings as TerminalTargetSettings) ?? {};
    if (settings.terminalType) {
      claudeAgent.setTerminalType(settings.terminalType);
    }
    await this.updateDisplay(ev.action);
  }

  override async onPropertyInspectorDidAppear(): Promise<void> {
    await this.sendPiState();
  }

  override async onSendToPlugin(
    ev: SendToPluginEvent<TerminalTargetPiMessage, TerminalTargetSettings>,
  ): Promise<void> {
    const payload = ev.payload as TerminalTargetPiMessage;
    try {
      if (payload?.type === "setTerminalType") {
        claudeAgent.setTerminalType(payload.terminalType);
        await ev.action.setSettings({ terminalType: payload.terminalType });
      } else if (payload?.type === "focus") {
        await claudeAgent.focusTerminal();
      }

      if (
        payload?.type === "refresh" ||
        payload?.type === "setTerminalType" ||
        payload?.type === "focus"
      ) {
        await this.sendPiState();
        await this.updateDisplay(ev.action);
      }
    } catch (error) {
      streamDeck.logger.warn("TerminalTargetAction PI message failed:", error);
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      await claudeAgent.focusTerminal();
      await ev.action.showOk();
      await this.updateDisplay(ev.action);
    } catch (error) {
      streamDeck.logger.error("TerminalTargetAction focus failed:", error);
      await ev.action.showAlert();
    }
  }

  private async updateAll(): Promise<void> {
    await Promise.allSettled(
      [...this.activeActions.values()].map((action) =>
        this.updateDisplay(action),
      ),
    );
  }

  private async sendPiState(): Promise<void> {
    const terminalType = claudeAgent.getTerminalType();
    const state = claudeAgent.getState();
    const [frontmostApp, isFocused, isRunning] = await Promise.all([
      terminalDetector.getFrontmostAppName(),
      claudeAgent.isTerminalFocused(),
      claudeAgent.isRunning(),
    ]);

    const payload = {
      terminalType,
      frontmostApp,
      isFocused,
      isRunning,
      claude: {
        sessionActive: state.status !== "disconnected",
        status: state.status,
      },
      supportedTerminals: [
        "kitty",
        "ghostty",
        "iterm",
        "terminal",
        "wezterm",
        "alacritty",
      ],
    };
    await streamDeck.ui.sendToPropertyInspector(
      payload as unknown as JsonValue,
    );
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
  ): Promise<void> {
    const terminalType = claudeAgent.getTerminalType();
    const [isFocused, isRunning] = await Promise.all([
      claudeAgent.isTerminalFocused(),
      claudeAgent.isRunning(),
    ]);

    const svg = this.createSvg({ terminalType, isFocused, isRunning });
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private createSvg(input: {
    terminalType: string;
    isFocused: boolean;
    isRunning: boolean;
  }): string {
    const label = input.terminalType.toUpperCase();
    const color = input.isFocused
      ? "#22c55e"
      : input.isRunning
        ? "#eab308"
        : "#64748b";
    const status = input.isFocused
      ? "FOCUSED"
      : input.isRunning
        ? "RUNNING"
        : "STOPPED";

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>
        <rect x="24" y="28" width="96" height="56" rx="10" fill="${color}" opacity="0.18"/>
        <rect x="24" y="28" width="96" height="56" rx="10" fill="none" stroke="${color}" stroke-width="3"/>
        <text x="72" y="58" font-family="system-ui, sans-serif" font-size="16" fill="${color}" text-anchor="middle" font-weight="bold">${label}</text>
        <text x="72" y="78" font-family="monospace" font-size="10" fill="#94a3b8" text-anchor="middle">${status}</text>
        <text x="72" y="115" font-family="system-ui, sans-serif" font-size="11" fill="${color}" text-anchor="middle" font-weight="bold">TERMINAL</text>
        <text x="72" y="130" font-family="system-ui, sans-serif" font-size="9" fill="#64748b" text-anchor="middle">Tap to focus</text>
      </svg>
    `;
  }
}
