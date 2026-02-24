/**
 * Agent Badge Action - Shows agent status and enables switching/spawning
 *
 * Each badge represents one AI coding agent (Claude, Aider, etc.).
 * - Display: Shows agent status (idle/working/waiting/error/disconnected)
 * - Short Press: Switch focus to this agent (make it "active")
 * - Long Press: Spawn new session of this agent in a new terminal
 */

import {
  SingletonAction,
  type KeyDownEvent,
  type KeyUpEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
  type DidReceiveSettingsEvent,
} from "@elgato/streamdeck";
import {
  stateAggregator,
  type AgentState,
  AGENT_COLORS,
  STATUS_COLORS,
} from "../agents/index.js";

/**
 * Settings for the agent badge
 */
interface AgentBadgeSettings {
  /** Which agent this badge represents */
  agentId?: string;
  /** Long press duration in ms to spawn new session */
  longPressDuration?: number;
}

/**
 * Per-button state tracking
 */
interface ButtonState {
  settings: AgentBadgeSettings;
  longPressTimer?: ReturnType<typeof setTimeout>;
  pulseTimer?: ReturnType<typeof setTimeout>;
  keyDownTime: number;
  isPulsing: boolean;
  ev: WillAppearEvent;
}

/**
 * Agent Badge Action
 */
export class AgentBadgeAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.agent-badge";

  // Per-button state tracking (keyed by action ID)
  private buttonStates = new Map<string, ButtonState>();
  // Track agents currently being spawned to prevent race conditions
  private spawningAgents = new Set<string>();

  // Shared handlers - created on first appear, removed on last disappear
  private stateHandler?: () => void;
  private activeChangeHandler?: (
    agentId: string | null,
    previousId: string | null,
  ) => void;
  private sharedInterval?: ReturnType<typeof setInterval>;

  constructor() {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    const actionId = ev.action.id;
    const settings = (ev.payload.settings as AgentBadgeSettings) || {};

    // Store per-button state
    this.buttonStates.set(actionId, {
      settings,
      keyDownTime: 0,
      isPulsing: false,
      ev,
    });

    // Set up shared handlers on first button appearance
    if (!this.stateHandler) {
      this.stateHandler = () => {
        void this.updateAll().catch(() => {
          // ignore
        });
      };
      stateAggregator.on("stateChange", this.stateHandler);
    }

    if (!this.activeChangeHandler) {
      this.activeChangeHandler = (
        newAgentId: string | null,
        _previousId: string | null,
      ) => {
        // Trigger pulse animation on the button matching the newly active agent
        for (const [id, state] of this.buttonStates) {
          const agentId = this.validateAgentId(state.settings.agentId);
          if (newAgentId === agentId) {
            void this.triggerPulseAnimation(id, state.ev, agentId);
          }
        }
      };
      stateAggregator.on("activeAgentChange", this.activeChangeHandler);
    }

    if (!this.sharedInterval) {
      this.sharedInterval = setInterval(() => {
        void this.updateAll().catch(() => {
          // ignore
        });
      }, 1000);
    }

    // Initial display update
    const agentId = this.validateAgentId(settings.agentId);
    await this.updateDisplay(ev, agentId, false);
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent,
  ): Promise<void> {
    const actionId = ev.action.id;
    const buttonState = this.buttonStates.get(actionId);
    if (buttonState) {
      buttonState.settings = (ev.payload.settings as AgentBadgeSettings) || {};
    }
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    const actionId = ev.action.id;
    const buttonState = this.buttonStates.get(actionId);

    if (buttonState) {
      // Clean up long press timer
      if (buttonState.longPressTimer) {
        clearTimeout(buttonState.longPressTimer);
      }

      // Clean up pulse timer
      if (buttonState.pulseTimer) {
        clearTimeout(buttonState.pulseTimer);
      }

      // Remove from tracking
      this.buttonStates.delete(actionId);
    }

    // Tear down shared resources when last button disappears
    if (this.buttonStates.size === 0) {
      if (this.stateHandler) {
        stateAggregator.removeListener("stateChange", this.stateHandler);
        this.stateHandler = undefined;
      }
      if (this.activeChangeHandler) {
        stateAggregator.removeListener(
          "activeAgentChange",
          this.activeChangeHandler,
        );
        this.activeChangeHandler = undefined;
      }
      if (this.sharedInterval) {
        clearInterval(this.sharedInterval);
        this.sharedInterval = undefined;
      }
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const actionId = ev.action.id;
    const buttonState = this.buttonStates.get(actionId);
    if (!buttonState) return;

    buttonState.keyDownTime = Date.now();
    const agentId = this.validateAgentId(buttonState.settings.agentId);
    const longPressDuration = this.validateLongPressDuration(
      buttonState.settings.longPressDuration,
    );

    // Clear any existing timer
    if (buttonState.longPressTimer) {
      clearTimeout(buttonState.longPressTimer);
    }

    // Start long press timer for spawning new session
    buttonState.longPressTimer = setTimeout(async () => {
      // Prevent concurrent spawns of the same agent
      if (this.spawningAgents.has(agentId)) return;

      this.spawningAgents.add(agentId);
      try {
        await stateAggregator.spawnSession(agentId);
        await ev.action.showOk();
      } catch (error) {
        console.error(`Failed to spawn ${agentId} session:`, error);
        await ev.action.showAlert();
      } finally {
        this.spawningAgents.delete(agentId);
      }
    }, longPressDuration);
  }

  override async onKeyUp(ev: KeyUpEvent): Promise<void> {
    const actionId = ev.action.id;
    const buttonState = this.buttonStates.get(actionId);
    if (!buttonState) return;

    const pressDuration = Date.now() - buttonState.keyDownTime;
    const agentId = this.validateAgentId(buttonState.settings.agentId);
    const longPressDuration = this.validateLongPressDuration(
      buttonState.settings.longPressDuration,
    );

    // Clear long press timer
    if (buttonState.longPressTimer) {
      clearTimeout(buttonState.longPressTimer);
      buttonState.longPressTimer = undefined;
    }

    // Short press: switch focus to this agent
    if (pressDuration < longPressDuration) {
      try {
        const agent = stateAggregator.getAgent(agentId);
        if (agent) {
          stateAggregator.setActiveAgent(agentId);
          await agent.focusTerminal();
          await ev.action.showOk();
        }
      } catch (error) {
        console.error(`Failed to switch to ${agentId}:`, error);
        await ev.action.showAlert();
      }
    }
  }

  /**
   * Validate agent ID - ensure it's a registered agent
   */
  private validateAgentId(agentId?: string): string {
    const registeredAgents = stateAggregator.getAgentIds();
    if (agentId && registeredAgents.includes(agentId)) {
      return agentId;
    }
    return "claude"; // Default fallback
  }

  /**
   * Validate long press duration - clamp to reasonable range
   */
  private validateLongPressDuration(duration?: number): number {
    const value = duration ?? 500;
    return Math.max(100, Math.min(value, 3000));
  }

  /**
   * Update all active buttons
   */
  private async updateAll(): Promise<void> {
    if (this.buttonStates.size === 0) return;
    await Promise.allSettled(
      [...this.buttonStates.entries()].map(([_actionId, state]) => {
        const agentId = this.validateAgentId(state.settings.agentId);
        return this.updateDisplay(state.ev, agentId, state.isPulsing);
      }),
    );
  }

  /**
   * Trigger a pulse animation when this agent becomes active
   */
  private async triggerPulseAnimation(
    actionId: string,
    ev: WillAppearEvent,
    agentId: string,
  ): Promise<void> {
    const buttonState = this.buttonStates.get(actionId);
    if (!buttonState) return;

    // Clear any existing pulse timer
    if (buttonState.pulseTimer) {
      clearTimeout(buttonState.pulseTimer);
    }

    // Start pulse animation
    buttonState.isPulsing = true;
    await this.updateDisplay(ev, agentId, true);

    // End pulse after animation duration (800ms)
    buttonState.pulseTimer = setTimeout(() => {
      buttonState.isPulsing = false;
      void this.updateDisplay(ev, agentId, false);
    }, 800);
  }

  private async updateDisplay(
    ev: WillAppearEvent,
    agentId: string,
    isPulsing: boolean,
  ): Promise<void> {
    const agent = stateAggregator.getAgent(agentId);
    const state = stateAggregator.getAgentState(agentId);
    const isActive = stateAggregator.getActiveAgentId() === agentId;

    if (!agent || !state) {
      await ev.action.setTitle("???");
      return;
    }

    // Get agent color
    const agentColor = AGENT_COLORS[agentId] ?? {
      primary: "#888888",
      muted: "#444444",
    };
    const statusColor = STATUS_COLORS[state.status] ?? STATUS_COLORS.idle;

    // Build title with status indicator
    const statusIndicator = this.getStatusIndicator(state, isActive);
    const title = `${statusIndicator}\n${agent.name}`;

    await ev.action.setTitle(title);

    // Set image with appropriate styling based on state
    await this.setAgentImage(
      ev,
      agentId,
      state,
      isActive,
      agentColor.primary,
      statusColor,
      isPulsing,
    );
  }

  private getStatusIndicator(state: AgentState, isActive: boolean): string {
    const activeMarker = isActive ? "●" : "○";

    switch (state.status) {
      case "working":
        return `${activeMarker} ⚡`;
      case "waiting":
        return `${activeMarker} ⏳`;
      case "error":
        return `${activeMarker} ❌`;
      case "disconnected":
        return `${activeMarker} ⚪`;
      case "idle":
      default:
        return activeMarker;
    }
  }

  private async setAgentImage(
    ev: WillAppearEvent,
    agentId: string,
    state: AgentState,
    isActive: boolean,
    agentColor: string,
    statusColor: string,
    isPulsing: boolean,
  ): Promise<void> {
    // Create SVG badge dynamically
    const opacity = state.status === "disconnected" ? 0.4 : 1.0;
    const circleStyle = isActive ? "fill" : "stroke";

    // Define filters and animations
    const defs: string[] = [];

    // Glow filter for active state
    if (isActive && state.status !== "disconnected") {
      defs.push(
        `<filter id="glow"><feGaussianBlur stdDeviation="3" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
      );
    }

    // Pulse animation when becoming active
    if (isPulsing) {
      defs.push(`
        <style>
          @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.15); opacity: 0.8; }
            100% { transform: scale(1); opacity: 1; }
          }
          .pulse-ring {
            animation: pulse 0.4s ease-out 2;
            transform-origin: 72px 60px;
          }
        </style>
      `);
    }

    const filterAttr =
      isActive && state.status !== "disconnected" ? 'filter="url(#glow)"' : "";
    const pulseClass = isPulsing ? 'class="pulse-ring"' : "";

    // Agent initials
    const initials = this.getAgentInitials(agentId);

    // Pulse ring overlay (visible during animation)
    const pulseRing = isPulsing
      ? `<circle cx="72" cy="60" r="42" fill="none" stroke="${agentColor}" stroke-width="3" opacity="0.5" class="pulse-ring"/>`
      : "";

    const svg = `
      <svg width="144" height="144" xmlns="http://www.w3.org/2000/svg">
        <defs>
          ${defs.join("")}
        </defs>
        <rect width="144" height="144" fill="#1a1a2e" rx="12"/>
        ${pulseRing}
        <circle cx="72" cy="60" r="35" ${circleStyle}="${agentColor}" stroke-width="4" opacity="${opacity}" ${filterAttr} ${pulseClass}/>
        <text x="72" y="70" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="${agentColor}" text-anchor="middle" opacity="${opacity}">${initials}</text>
        <circle cx="110" cy="110" r="12" fill="${statusColor}" opacity="${opacity}"/>
      </svg>
    `;

    const base64 = Buffer.from(svg).toString("base64");
    await ev.action.setImage(`data:image/svg+xml;base64,${base64}`);
  }

  private getAgentInitials(agentId: string): string {
    const initials: Record<string, string> = {
      claude: "CC",
      aider: "AI",
      codex: "CX",
      gemini: "GE",
      opencode: "OC",
      factory: "FD",
    };
    return initials[agentId] ?? agentId.slice(0, 2).toUpperCase();
  }
}
