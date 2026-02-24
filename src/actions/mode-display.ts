import {
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
  type KeyDownEvent,
} from "@elgato/streamdeck";
import {
  stateAggregator,
  type AgentState,
  type AggregatedState,
} from "../agents/index.js";
import { svgToDataUri } from "../utils/svg-utils.js";

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

  private stateHandler?: (state: AggregatedState) => void;
  private activeActions = new Map<string, WillAppearEvent["action"]>();

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);

    const agentState = this.getActiveAgentState();
    await this.updateDisplay(ev.action, agentState);

    if (!this.stateHandler) {
      this.stateHandler = () => {
        void this.updateAllDisplays().catch(() => {
          // ignore
        });
      };
      stateAggregator.on("stateChange", this.stateHandler);
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    if (this.activeActions.size === 0 && this.stateHandler) {
      stateAggregator.removeListener("stateChange", this.stateHandler);
      this.stateHandler = undefined;
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    try {
      const success = await stateAggregator.cycleMode();
      if (success) {
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("Mode cycle failed:", error);
      await ev.action.showAlert();
    }
  }

  private getActiveAgentState(): AgentState | undefined {
    const activeId = stateAggregator.getActiveAgentId();
    if (activeId) {
      return stateAggregator.getAgentState(activeId);
    }
    return undefined;
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
    state: AgentState | undefined,
  ): Promise<void> {
    const mode = state?.mode || "default";
    const svg = this.createModeSvg(mode);
    await action.setImage(svgToDataUri(svg));
  }

  private async updateAllDisplays(): Promise<void> {
    if (this.activeActions.size === 0) return;
    const agentState = this.getActiveAgentState();
    await Promise.allSettled(
      [...this.activeActions.values()].map((action) =>
        this.updateDisplay(action, agentState),
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
        icon: "\u25C8",
        label: "Normal",
        sublabel: "Ask permission",
      },
      plan: {
        color: "#38bdf8",
        bgColor: "#0c4a6e",
        icon: "\u2630",
        label: "Plan",
        sublabel: "Read-only",
      },
      acceptEdits: {
        color: "#a3e635",
        bgColor: "#1a2e05",
        icon: "\u270E",
        label: "Auto Edit",
        sublabel: "Accept edits",
      },
      bypassPermissions: {
        color: "#ef4444",
        bgColor: "#450a0a",
        icon: "!",
        label: "YOLO",
        sublabel: "No prompts",
      },
      dontAsk: {
        color: "#fbbf24",
        bgColor: "#422006",
        icon: "\u2715",
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
