import {
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import { claudeAgent, type AgentState } from "../agents/index.js";

/**
 * Claude Mood Action - Animated face showing current activity state
 */
export class ClaudeMoodAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.claude-mood";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private updateHandler?: (state: AgentState) => void;
  private refreshInterval?: ReturnType<typeof setInterval>;
  private frame = 0;

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

    // Animate at 500ms for smooth transitions
    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(() => {
        if (this.activeActions.size === 0) return;
        this.frame = (this.frame + 1) % 4;
        void this.updateAll().catch(() => {
          // ignore
        });
      }, 500);
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
    const svg = this.createMoodSvg(state);
    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private createMoodSvg(state: AgentState): string {
    const status = state.status || "idle";
    const isActive = state.status !== "disconnected";

    let faceColor = "#d97706"; // Orange Claude color
    let expression = "happy";
    let label = "Ready";
    let eyeAnim = "";
    let mouthPath = "M58 78 Q72 88 86 78"; // Smile

    if (status === "working") {
      expression = "focused";
      label = "Working";
      faceColor = "#22c55e";
      // Blinking animation
      const eyeHeight = this.frame % 2 === 0 ? 5 : 1;
      eyeAnim = `ry="${eyeHeight}"`;
      mouthPath = "M60 78 L84 78"; // Neutral
    } else if (status === "waiting") {
      expression = "thinking";
      label = "Waiting";
      faceColor = "#eab308";
      // Eyes look up animation
      const eyeOffset = Math.sin(this.frame * 0.8) * 3;
      eyeAnim = `cy="${60 + eyeOffset}"`;
      mouthPath = "M62 82 Q72 78 82 82"; // Slight frown/thinking
    } else if (status === "error") {
      expression = "worried";
      label = "Error!";
      faceColor = "#ef4444";
      mouthPath = "M58 85 Q72 75 86 85"; // Frown
    } else if (!isActive) {
      expression = "sleeping";
      label = "Idle";
      faceColor = "#64748b";
      // Closed eyes
      eyeAnim = `ry="1"`;
      mouthPath = "M65 80 Q72 82 79 80"; // Slight smile
    }

    // Breathing animation for face
    const breathScale = 1 + Math.sin(this.frame * 0.5) * 0.02;

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>

        <!-- Face -->
        <circle cx="72" cy="65" r="${35 * breathScale}" fill="${faceColor}"/>

        <!-- Eyes -->
        <ellipse cx="60" cy="60" rx="5" ${eyeAnim || 'ry="5"'} fill="#0f172a"/>
        <ellipse cx="84" cy="60" rx="5" ${eyeAnim || 'ry="5"'} fill="#0f172a"/>

        ${
          expression === "happy" || expression === "sleeping"
            ? `
          <!-- Eye shine -->
          <circle cx="62" cy="58" r="2" fill="#ffffff" opacity="0.5"/>
          <circle cx="86" cy="58" r="2" fill="#ffffff" opacity="0.5"/>
        `
            : ""
        }

        <!-- Mouth -->
        <path d="${mouthPath}" fill="none" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>

        ${
          status === "working"
            ? `
          <!-- Thinking dots -->
          <circle cx="100" cy="45" r="${3 + (this.frame % 3)}" fill="${faceColor}" opacity="0.6"/>
          <circle cx="110" cy="38" r="${2 + ((this.frame + 1) % 3)}" fill="${faceColor}" opacity="0.4"/>
        `
            : ""
        }

        <!-- Label -->
        <text x="72" y="118" font-family="system-ui, sans-serif" font-size="12" fill="${faceColor}" text-anchor="middle" font-weight="bold">${label}</text>
        <text x="72" y="132" font-family="system-ui, sans-serif" font-size="9" fill="#64748b" text-anchor="middle">Claude</text>
      </svg>
    `;
  }
}
