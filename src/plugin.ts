import streamDeck from "@elgato/streamdeck";

import { ApproveAction } from "./actions/approve.js";
import { RejectAction } from "./actions/reject.js";
import { InterruptAction } from "./actions/interrupt.js";
import { YoloModeAction } from "./actions/yolo-mode.js";
import { PlanModeAction } from "./actions/plan-mode.js";
import { ModeCycleAction } from "./actions/mode-cycle.js";
import { SwitchModelAction } from "./actions/switch-model.js";
import { NewSessionAction } from "./actions/new-session.js";
import { ContinueSessionAction } from "./actions/continue-session.js";
import { ToggleThinkingAction } from "./actions/toggle-thinking.js";
import { StatusAction } from "./actions/status.js";
import { TokenDisplayAction } from "./actions/token-display.js";
import { ModelDisplayAction } from "./actions/model-display.js";
import { ModeDisplayAction } from "./actions/mode-display.js";
import { ActivityDisplayAction } from "./actions/activity-display.js";
import { CostDisplayAction } from "./actions/cost-display.js";
import { ContextBarAction } from "./actions/context-bar.js";
import { ContextPercentAction } from "./actions/context-percent.js";
import { SessionTimerAction } from "./actions/session-timer.js";
import { ContextAutoCompactAction } from "./actions/context-auto-compact.js";
import { BrainSearchAction } from "./actions/brain-search.js";
import { MistakeLogAction } from "./actions/mistake-log.js";
import { GitStatusAction } from "./actions/git-status.js";
import { SlashCommandAction } from "./actions/slash-command.js";
import { SlashCommitAction } from "./actions/slash-commit.js";
import { SlashReviewAction } from "./actions/slash-review.js";
import { ToolBreakdownAction } from "./actions/tool-breakdown.js";
import { ClaudeMoodAction } from "./actions/claude-mood.js";
import { IdleDetectorAction } from "./actions/idle-detector.js";
import { ClipboardSendAction } from "./actions/clipboard-send.js";
import { ScreenshotClaudeAction } from "./actions/screenshot-claude.js";
import { MatrixRainAction } from "./actions/matrix-rain.js";
import { SessionExportAction } from "./actions/session-export.js";
import { PromptPresetAction } from "./actions/prompt-preset.js";
import { TerminalTargetAction } from "./actions/terminal-target.js";
import { SessionPickerAction } from "./actions/session-picker.js";
import { PermissionDetailsAction } from "./actions/permission-details.js";
import { MacroAction } from "./actions/macro.js";
import { McpStatusAction } from "./actions/mcp-status.js";
import { AgentBadgeAction } from "./actions/agent-badge.js";
import { ActiveAgentDisplayAction } from "./actions/active-agent-display.js";
import { SettingsAction } from "./actions/settings.js";
import { SessionManagerAction } from "./actions/session-manager.js";
import { UsageAnalyticsAction } from "./actions/usage-analytics.js";
import { initializeDefaultAgents } from "./agents/index.js";

// Initialize multi-agent system (registers all agents, starts state watching)
initializeDefaultAgents().catch((err) => {
  streamDeck.logger.error("Failed to initialize agents:", err);
});

// Register all actions with their UUIDs
// Control actions
streamDeck.actions.registerAction(new ApproveAction());
streamDeck.actions.registerAction(new RejectAction());
streamDeck.actions.registerAction(new InterruptAction());
streamDeck.actions.registerAction(new YoloModeAction());
streamDeck.actions.registerAction(new PlanModeAction());
streamDeck.actions.registerAction(new ModeCycleAction());
streamDeck.actions.registerAction(new SwitchModelAction());
streamDeck.actions.registerAction(new NewSessionAction());
streamDeck.actions.registerAction(new ContinueSessionAction());
streamDeck.actions.registerAction(new ToggleThinkingAction());
streamDeck.actions.registerAction(new StatusAction());

// Display actions (dynamic info panels)
streamDeck.actions.registerAction(new TokenDisplayAction());
streamDeck.actions.registerAction(new ModelDisplayAction());
streamDeck.actions.registerAction(new ModeDisplayAction());
streamDeck.actions.registerAction(new ActivityDisplayAction());
streamDeck.actions.registerAction(new CostDisplayAction());
streamDeck.actions.registerAction(new ContextBarAction());
streamDeck.actions.registerAction(new ContextPercentAction());
streamDeck.actions.registerAction(new SessionTimerAction());
streamDeck.actions.registerAction(new ContextAutoCompactAction());
streamDeck.actions.registerAction(new BrainSearchAction());
streamDeck.actions.registerAction(new MistakeLogAction());
streamDeck.actions.registerAction(new GitStatusAction());
streamDeck.actions.registerAction(new SlashCommandAction());
streamDeck.actions.registerAction(new SlashCommitAction());
streamDeck.actions.registerAction(new SlashReviewAction());
streamDeck.actions.registerAction(new ToolBreakdownAction());
streamDeck.actions.registerAction(new ClaudeMoodAction());
streamDeck.actions.registerAction(new IdleDetectorAction());
streamDeck.actions.registerAction(new ClipboardSendAction());
streamDeck.actions.registerAction(new ScreenshotClaudeAction());
streamDeck.actions.registerAction(new MatrixRainAction());
streamDeck.actions.registerAction(new SessionExportAction());
streamDeck.actions.registerAction(new PromptPresetAction());
streamDeck.actions.registerAction(new TerminalTargetAction());
streamDeck.actions.registerAction(new SessionPickerAction());
streamDeck.actions.registerAction(new PermissionDetailsAction());
streamDeck.actions.registerAction(new MacroAction());
streamDeck.actions.registerAction(new McpStatusAction());

// Multi-agent actions
streamDeck.actions.registerAction(new AgentBadgeAction());
streamDeck.actions.registerAction(new ActiveAgentDisplayAction());

// Configuration
streamDeck.actions.registerAction(new SettingsAction());

// Phase 5: Advanced Features
streamDeck.actions.registerAction(new SessionManagerAction());
streamDeck.actions.registerAction(new UsageAnalyticsAction());

// Connect to Stream Deck
streamDeck.connect();

streamDeck.logger.info("Claude Deck plugin initialized");
