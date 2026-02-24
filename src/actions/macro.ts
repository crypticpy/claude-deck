import streamDeck, {
  SingletonAction,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type PropertyInspectorDidAppearEvent,
  type SendToPluginEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import {
  claudeAgent,
  stateAggregator,
  AGENT_REGISTRY,
  type BaseAgentAdapter,
} from "../agents/index.js";
import type { JsonObject, JsonValue } from "@elgato/utils";

/**
 * Condition types for conditional execution
 */
type StepCondition =
  | { type: "always" }
  | { type: "previousSucceeded" }
  | { type: "previousFailed" }
  | {
      type: "agentStatus";
      agentId: string;
      status: "idle" | "working" | "waiting" | "error" | "disconnected";
    };

/**
 * Legacy single-action step types (backwards compatible)
 */
type LegacyMacroStep =
  | { type: "focusTerminal" }
  | { type: "sendText"; text: string }
  | { type: "sendKeystroke"; key: string; modifiers?: string[] }
  | { type: "delay"; ms: number }
  | { type: "openTerminal"; command: string; cwd?: string };

/**
 * Enhanced multi-agent step types (Phase 5)
 */
type MultiAgentMacroStep = LegacyMacroStep & {
  /** Target agent for this step (undefined = active agent or legacy behavior) */
  targetAgent?: string;
  /** Delay in ms before executing this step (0-10000) */
  delayBefore?: number;
  /** Condition for executing this step */
  condition?: StepCondition;
  /** Human-readable label for this step */
  label?: string;
};

/**
 * A macro step can be either legacy format or enhanced format
 */
type MacroStep = LegacyMacroStep | MultiAgentMacroStep;

/**
 * Result of executing a single step
 */
interface StepResult {
  success: boolean;
  error?: string;
  skipped?: boolean;
}

type MacroSettings = JsonObject & {
  label?: string;
  color?: string;
  steps?: MacroStep[];
  /** Stop execution on first error (default: true for backwards compat) */
  stopOnError?: boolean;
};

type MacroPiMessage =
  | { type: "refresh" }
  | {
      type: "setPreset";
      preset: "review" | "commit" | "focus" | "crossAgentReview";
    };

export class MacroAction extends SingletonAction {
  manifestId = "com.anthropic.claude-deck.macro";

  private activeActions = new Map<string, WillAppearEvent["action"]>();
  private settingsById = new Map<string, MacroSettings>();

  override async onWillAppear(ev: WillAppearEvent): Promise<void> {
    this.activeActions.set(ev.action.id, ev.action);
    this.settingsById.set(
      ev.action.id,
      (ev.payload.settings as MacroSettings) ?? {},
    );
    await this.updateDisplay(ev.action);
  }

  override async onWillDisappear(ev: WillDisappearEvent): Promise<void> {
    this.activeActions.delete(ev.action.id);
    this.settingsById.delete(ev.action.id);
  }

  override async onDidReceiveSettings(
    ev: DidReceiveSettingsEvent,
  ): Promise<void> {
    this.settingsById.set(
      ev.action.id,
      (ev.payload.settings as MacroSettings) ?? {},
    );
    await this.updateDisplay(ev.action);
  }

  override async onPropertyInspectorDidAppear(
    ev: PropertyInspectorDidAppearEvent,
  ): Promise<void> {
    const agents = Object.keys(AGENT_REGISTRY);
    await streamDeck.ui.sendToPropertyInspector({
      settings: this.getSettings(ev.action.id),
      presets: this.getPresets(),
      availableAgents: agents,
    } as unknown as JsonValue);
  }

  override async onSendToPlugin(
    ev: SendToPluginEvent<MacroPiMessage, MacroSettings>,
  ): Promise<void> {
    const payload = ev.payload as MacroPiMessage;
    if (payload?.type === "refresh") {
      const agents = Object.keys(AGENT_REGISTRY);
      await streamDeck.ui.sendToPropertyInspector({
        settings: this.getSettings(ev.action.id),
        presets: this.getPresets(),
        availableAgents: agents,
      } as unknown as JsonValue);
      return;
    }
    if (payload?.type === "setPreset") {
      const preset = this.getPresets()[payload.preset];
      if (!preset) return;
      await ev.action.setSettings(preset);
      this.settingsById.set(ev.action.id, preset);
      await this.updateDisplay(ev.action);
      const agents = Object.keys(AGENT_REGISTRY);
      await streamDeck.ui.sendToPropertyInspector({
        settings: preset,
        presets: this.getPresets(),
        availableAgents: agents,
      } as unknown as JsonValue);
    }
  }

  override async onKeyDown(ev: KeyDownEvent): Promise<void> {
    const settings = this.getSettings(ev.action.id);
    const steps = settings.steps ?? [];

    if (steps.length === 0) {
      await ev.action.showAlert();
      return;
    }

    try {
      await ev.action.setTitle("...");
      const results = await this.runMacro(steps, settings.stopOnError ?? true);

      // Check if any step failed
      const anyFailed = results.some((r) => !r.success && !r.skipped);
      if (anyFailed) {
        await ev.action.showAlert();
      } else {
        await ev.action.showOk();
      }
    } catch (error) {
      streamDeck.logger.error("MacroAction failed:", error);
      await ev.action.showAlert();
    } finally {
      await this.updateDisplay(ev.action);
    }
  }

  private getSettings(actionId: string): MacroSettings {
    const stored = this.settingsById.get(actionId) ?? {};
    return {
      label: stored.label ?? "Macro",
      color: stored.color ?? "#3b82f6",
      steps: stored.steps ?? [],
      stopOnError: stored.stopOnError ?? true,
    };
  }

  private getPresets(): Record<string, MacroSettings> {
    return {
      focus: {
        label: "Focus",
        color: "#22c55e",
        steps: [{ type: "focusTerminal" }],
      },
      review: {
        label: "Review",
        color: "#8b5cf6",
        steps: [
          { type: "focusTerminal" },
          { type: "sendText", text: "/review" },
        ],
      },
      commit: {
        label: "Commit",
        color: "#f59e0b",
        steps: [
          { type: "focusTerminal" },
          { type: "sendText", text: "/commit" },
        ],
      },
      // New Phase 5 preset: Cross-agent workflow
      crossAgentReview: {
        label: "X-Review",
        color: "#ec4899",
        steps: [
          {
            type: "sendText",
            text: "/commit",
            targetAgent: "claude",
            label: "Commit in Claude",
            condition: { type: "always" },
          },
          {
            type: "delay",
            ms: 2000,
            label: "Wait for commit",
          },
          {
            type: "focusTerminal",
            targetAgent: "aider",
            label: "Focus Aider",
            condition: { type: "previousSucceeded" },
          },
          {
            type: "sendText",
            text: "/diff",
            targetAgent: "aider",
            label: "Review in Aider",
            delayBefore: 500,
            condition: { type: "previousSucceeded" },
          },
        ] as MultiAgentMacroStep[],
        stopOnError: false,
      },
    };
  }

  /**
   * Execute a macro with support for multi-agent steps and conditions
   */
  private async runMacro(
    steps: MacroStep[],
    stopOnError: boolean,
  ): Promise<StepResult[]> {
    if (steps.length > 50) throw new Error("Macro too long");

    const results: StepResult[] = [];
    let previousResult: StepResult = { success: true };

    for (const step of steps) {
      // Handle delay before step (new feature)
      const delayBefore = (step as MultiAgentMacroStep).delayBefore;
      if (delayBefore && delayBefore > 0) {
        await new Promise((r) => setTimeout(r, Math.min(delayBefore, 10_000)));
      }

      // Check condition
      const condition = (step as MultiAgentMacroStep).condition;
      if (!this.shouldExecuteStep(condition, previousResult)) {
        results.push({ success: true, skipped: true });
        continue;
      }

      // Execute the step
      const result = await this.executeStep(step);
      results.push(result);
      previousResult = result;

      // Stop on error if configured
      if (!result.success && stopOnError) {
        streamDeck.logger.error(`Macro step failed: ${result.error}`);
        break;
      }
    }

    return results;
  }

  /**
   * Check if a step should be executed based on its condition
   */
  private shouldExecuteStep(
    condition: StepCondition | undefined,
    previousResult: StepResult,
  ): boolean {
    if (!condition || condition.type === "always") {
      return true;
    }

    switch (condition.type) {
      case "previousSucceeded":
        return previousResult.success && !previousResult.skipped;

      case "previousFailed":
        return !previousResult.success;

      case "agentStatus": {
        const agentState = stateAggregator.getAgentState(condition.agentId);
        return agentState?.status === condition.status;
      }

      default:
        return true;
    }
  }

  /**
   * Execute a single macro step, optionally targeting a specific agent
   */
  private async executeStep(step: MacroStep): Promise<StepResult> {
    const targetAgentId = (step as MultiAgentMacroStep).targetAgent;

    try {
      // Get the agent adapter to use (always returns a valid agent)
      const agent = this.getAgentForStep(targetAgentId);

      switch (step.type) {
        case "focusTerminal":
          await agent.focusTerminal();
          return { success: true };

        case "sendText": {
          const ok = await agent.sendText(step.text);
          if (!ok) return { success: false, error: "sendText failed" };
          return { success: true };
        }

        case "sendKeystroke": {
          const ok = await agent.sendKeystroke(step.key, step.modifiers ?? []);
          if (!ok) return { success: false, error: "sendKeystroke failed" };
          return { success: true };
        }

        case "delay":
          await new Promise((r) =>
            setTimeout(r, Math.min(Math.max(step.ms, 0), 10_000)),
          );
          return { success: true };

        case "openTerminal":
          await agent.spawnSession({ prompt: step.command, cwd: step.cwd });
          return { success: true };

        default:
          return {
            success: false,
            error: `Unknown macro step: ${String((step as { type?: unknown }).type)}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get the agent adapter for a step, falling back to claudeAgent
   */
  private getAgentForStep(targetAgentId: string | undefined): BaseAgentAdapter {
    if (targetAgentId) {
      const agent = AGENT_REGISTRY[targetAgentId];
      if (agent) return agent;
    }

    // Use active agent if available, otherwise fall back to Claude
    return stateAggregator.getActiveAgent() ?? claudeAgent;
  }

  private async updateDisplay(
    action: WillAppearEvent["action"],
  ): Promise<void> {
    const settings = this.getSettings(action.id);
    const label = (settings.label ?? "Macro").toUpperCase();
    const color = settings.color ?? "#3b82f6";
    const stepCount = settings.steps?.length ?? 0;

    // Count unique agents targeted in the macro
    const targetedAgents = new Set<string>();
    for (const step of settings.steps ?? []) {
      const targetAgent = (step as MultiAgentMacroStep).targetAgent;
      if (targetAgent) {
        targetedAgents.add(targetAgent);
      }
    }
    const isMultiAgent = targetedAgents.size > 1;

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
        <rect width="144" height="144" fill="#0f172a" rx="12"/>
        <rect x="20" y="30" width="104" height="54" rx="10" fill="${color}" opacity="0.16"/>
        <rect x="20" y="30" width="104" height="54" rx="10" fill="none" stroke="${color}" stroke-width="3"/>
        <text x="72" y="60" font-family="system-ui, sans-serif" font-size="16" fill="${color}" text-anchor="middle" font-weight="bold">${this.truncate(label, 10)}</text>
        <text x="72" y="80" font-family="monospace" font-size="10" fill="#94a3b8" text-anchor="middle">${stepCount} step${stepCount === 1 ? "" : "s"}${isMultiAgent ? " (multi)" : ""}</text>
        <text x="72" y="120" font-family="system-ui, sans-serif" font-size="11" fill="${color}" text-anchor="middle" font-weight="bold">MACRO</text>
      </svg>
    `;

    await action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  private truncate(str: string, max: number): string {
    return str.length <= max ? str : `${str.slice(0, max - 1)}…`;
  }
}
