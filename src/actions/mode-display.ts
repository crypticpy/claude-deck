import {
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
  type KeyDownEvent,
} from "@elgato/streamdeck";
import {
  claudeAgent,
  stateAggregator,
  type AgentState,
} from "../agents/index.js";

/**
 * Mode Display Action - Shows current permission mode with visual indicator
 *
 * Modes:
 * - default: Normal mode (prompts for permission)
 * - plan: Read-only planning mode
 * - acceptEdits: Auto-accept file edits
 * - bypassPermissions: YOLO mode (skip all)
 */
export class ModeDisplayAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.mode-display";

  private updateHandler?: (state: AgentState) => void;
  private activeActions = new Map<string, WillAppearEvent["action"]>();

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);

    const state = claudeAgent.getState();
    await this.updateDisplay(ev.action, state);

    if (!this.updateHandler) {
      this.updateHandler = (newState: AgentState) => {
        void this.updateAllWithState(newState).catch(() => {
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

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    // Cycle through modes on press
    const success = await stateAggregator.cycleMode();
    if (success) {
      await ev.action.showOk();
    } else {
      await ev.action.showAlert();
    }
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
    state: AgentState,
  ): Promise<void> {
    const mode = state.mode || "default";
    const svg = this.createModeSvg(mode);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private async updateAllWithState(state: AgentState): Promise<void> {
    if (this.activeActions.size === 0) return;
    await Promise.allSettled(
      [...this.activeActions.values()].map((action) =>
        this.updateDisplay(action, state),
      ),
    );
  }

  private createModeSvg(mode: string): string {
    const configs: Record<
      string,
      {
        color: string;
        bgColor: string;
        icon: string;
        label: string;
        sublabel: string;
      }
    > = {
      default: {
        color: "#94a3b8",
        bgColor: "#1e293b",
        icon: "🛡️",
        label: "Normal",
        sublabel: "Ask permission",
      },
      plan: {
        color: "#38bdf8",
        bgColor: "#0c4a6e",
        icon: "📋",
        label: "Plan",
        sublabel: "Read-only",
      },
      acceptEdits: {
        color: "#a3e635",
        bgColor: "#1a2e05",
        icon: "✏️",
        label: "Auto Edit",
        sublabel: "Accept edits",
      },
      bypassPermissions: {
        color: "#ef4444",
        bgColor: "#450a0a",
        icon: "⚡",
        label: "YOLO",
        sublabel: "No prompts",
      },
      dontAsk: {
        color: "#fbbf24",
        bgColor: "#422006",
        icon: "🚫",
        label: "Deny",
        sublabel: "Auto-deny",
      },
    };

    const config = configs[mode] || configs.default;

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="${config.bgColor}" rx="12"/>

        <!-- Mode icon -->
        <text x="72" y="55" font-size="32" text-anchor="middle">${config.icon}</text>

        <!-- Mode name -->
        <text x="72" y="90" font-family="system-ui, sans-serif" font-size="20" fill="${config.color}" text-anchor="middle" font-weight="bold">${config.label}</text>

        <!-- Subtitle -->
        <text x="72" y="115" font-family="system-ui, sans-serif" font-size="11" fill="#666" text-anchor="middle">${config.sublabel}</text>
      </svg>
    `;
  }
}
