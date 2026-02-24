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
import { escapeXml, svgToDataUri } from "../utils/svg-utils.js";

/**
 * Model Display Action - Shows current model with visual badge
 *
 * Displays the current model (Sonnet/Opus/Haiku) with color coding
 * Press to cycle models
 */
export class ModelDisplayAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.model-display";

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
      const success = await stateAggregator.cycleModel();
      if (success) {
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (error) {
      console.error("Model switch failed:", error);
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
    const model = state?.model || "sonnet";
    const svg = this.createModelSvg(model);
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

  private createModelSvg(model: string): string {
    const configs: Record<
      string,
      { color: string; bgColor: string; icon: string }
    > = {
      opus: {
        color: "#a855f7",
        bgColor: "#2d1f3d",
        icon: "\u25C6", // Diamond for premium
      },
      sonnet: {
        color: "#f97316",
        bgColor: "#2d1f1a",
        icon: "\u25CF", // Circle for balanced
      },
      haiku: {
        color: "#06b6d4",
        bgColor: "#1a2d2d",
        icon: "\u25CB", // Light circle for fast
      },
    };

    const config = configs[model] || configs.sonnet;
    const displayName = model.charAt(0).toUpperCase() + model.slice(1);

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="${config.bgColor}" rx="12"/>

        <!-- Model icon -->
        <text x="72" y="60" font-family="system-ui, sans-serif" font-size="36" fill="${config.color}" text-anchor="middle">${config.icon}</text>

        <!-- Model name -->
        <text x="72" y="95" font-family="system-ui, sans-serif" font-size="22" fill="${config.color}" text-anchor="middle" font-weight="bold">${escapeXml(displayName)}</text>

        <!-- Subtitle -->
        <text x="72" y="120" font-family="system-ui, sans-serif" font-size="12" fill="#666" text-anchor="middle">TAP TO SWITCH</text>
      </svg>
    `;
  }
}
