/**
 * Stream Deck Profile Layout Definitions
 *
 * Defines button layouts for each Stream Deck device type.
 * Used by generate-profiles.ts to create .streamDeckProfile files.
 */

const UUID_PREFIX = "com.anthropic.claude-deck";

// Action UUID helper
const action = (name: string) => `${UUID_PREFIX}.${name}`;

// Device type constants
export const DeviceType = {
  STANDARD: 0, // MK.2 - 15 buttons (5x3)
  MINI: 1, // Mini - 6 buttons (3x2)
  XL: 2, // XL - 32 buttons (8x4)
  PEDAL: 5, // Pedal - 3 buttons (3x1)
  PLUS: 7, // Plus - 8 buttons (4x2) + 4 dials
  NEO: 8, // Neo - 8 buttons (4x2) + info bar
} as const;

export interface DeviceConfig {
  deviceType: number;
  rows: number;
  columns: number;
  name: string;
  fileName: string;
}

export interface ButtonAction {
  uuid: string;
  row: number;
  column: number;
  settings?: Record<string, unknown>;
}

export interface ProfileLayout {
  device: DeviceConfig;
  actions: ButtonAction[];
}

// Device configurations
// IMPORTANT: fileName must match the "Name" in manifest.json for Stream Deck to find them
export const devices: Record<string, DeviceConfig> = {
  standard: {
    deviceType: DeviceType.STANDARD,
    rows: 3,
    columns: 5,
    name: "Claude Control",
    fileName: "Claude Control.streamDeckProfile",
  },
  mini: {
    deviceType: DeviceType.MINI,
    rows: 2,
    columns: 3,
    name: "Claude Control (Mini)",
    fileName: "Claude Control (Mini).streamDeckProfile",
  },
  xl: {
    deviceType: DeviceType.XL,
    rows: 4,
    columns: 8,
    name: "Claude Control (XL)",
    fileName: "Claude Control (XL).streamDeckProfile",
  },
  pedal: {
    deviceType: DeviceType.PEDAL,
    rows: 1,
    columns: 3,
    name: "Claude Control (Pedal)",
    fileName: "Claude Control (Pedal).streamDeckProfile",
  },
  plus: {
    deviceType: DeviceType.PLUS,
    rows: 2,
    columns: 4,
    name: "Claude Control (Plus)",
    fileName: "Claude Control (Plus).streamDeckProfile",
  },
  neo: {
    deviceType: DeviceType.NEO,
    rows: 2,
    columns: 4,
    name: "Claude Control (Neo)",
    fileName: "Claude Control (Neo).streamDeckProfile",
  },
};

/**
 * Mini Layout (6 buttons, 3x2)
 * Essential controls for the smallest device
 *
 * ┌─────────┬─────────┬─────────┐
 * │ Approve │ Reject  │Interrupt│
 * ├─────────┼─────────┼─────────┤
 * │ Status  │  Mode   │  Model  │
 * └─────────┴─────────┴─────────┘
 */
export const miniLayout: ProfileLayout = {
  device: devices.mini,
  actions: [
    // Row 0
    { uuid: action("approve"), row: 0, column: 0 },
    { uuid: action("reject"), row: 0, column: 1 },
    { uuid: action("interrupt"), row: 0, column: 2 },
    // Row 1
    { uuid: action("status"), row: 1, column: 0 },
    { uuid: action("mode-cycle"), row: 1, column: 1 },
    { uuid: action("switch-model"), row: 1, column: 2 },
  ],
};

/**
 * Neo/Plus Layout (8 buttons, 4x2)
 * Core workflow controls
 *
 * ┌─────────┬─────────┬─────────┬─────────┐
 * │ Approve │ Reject  │Interrupt│Continue │
 * ├─────────┼─────────┼─────────┼─────────┤
 * │ Status  │  Mode   │  Model  │ Tokens  │
 * └─────────┴─────────┴─────────┴─────────┘
 */
const eightButtonLayout: ButtonAction[] = [
  // Row 0
  { uuid: action("approve"), row: 0, column: 0 },
  { uuid: action("reject"), row: 0, column: 1 },
  { uuid: action("interrupt"), row: 0, column: 2 },
  { uuid: action("continue-session"), row: 0, column: 3 },
  // Row 1
  { uuid: action("status"), row: 1, column: 0 },
  { uuid: action("mode-display"), row: 1, column: 1 },
  { uuid: action("model-display"), row: 1, column: 2 },
  { uuid: action("token-display"), row: 1, column: 3 },
];

export const neoLayout: ProfileLayout = {
  device: devices.neo,
  actions: eightButtonLayout,
};

export const plusLayout: ProfileLayout = {
  device: devices.plus,
  actions: eightButtonLayout,
};

/**
 * Standard/MK.2 Layout (15 buttons, 5x3)
 * Full control panel
 *
 * ┌─────────┬─────────┬─────────┬─────────┬─────────┐
 * │ Approve │ Reject  │Interrupt│Continue │   New   │
 * ├─────────┼─────────┼─────────┼─────────┼─────────┤
 * │  Mode   │  Model  │Thinking │ Commit  │ Review  │
 * ├─────────┼─────────┼─────────┼─────────┼─────────┤
 * │Activity │ Tokens  │ Context │  Cost   │  Agent  │
 * └─────────┴─────────┴─────────┴─────────┴─────────┘
 */
export const standardLayout: ProfileLayout = {
  device: devices.standard,
  actions: [
    // Row 0 - Primary controls
    { uuid: action("approve"), row: 0, column: 0 },
    { uuid: action("reject"), row: 0, column: 1 },
    { uuid: action("interrupt"), row: 0, column: 2 },
    { uuid: action("continue-session"), row: 0, column: 3 },
    { uuid: action("new-session"), row: 0, column: 4 },
    // Row 1 - Mode/Model/Commands
    { uuid: action("mode-display"), row: 1, column: 0 },
    { uuid: action("model-display"), row: 1, column: 1 },
    { uuid: action("toggle-thinking"), row: 1, column: 2 },
    { uuid: action("slash-commit"), row: 1, column: 3 },
    { uuid: action("slash-review"), row: 1, column: 4 },
    // Row 2 - Info displays
    { uuid: action("activity-display"), row: 2, column: 0 },
    { uuid: action("token-display"), row: 2, column: 1 },
    { uuid: action("context-bar"), row: 2, column: 2 },
    { uuid: action("cost-display"), row: 2, column: 3 },
    { uuid: action("active-agent-display"), row: 2, column: 4 },
  ],
};

/**
 * XL Layout (32 buttons, 8x4)
 * Complete command center with multi-agent support
 *
 * ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
 * │ Approve │ Reject  │Interrupt│Continue │   New   │ Session │  YOLO   │  Plan   │
 * ├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
 * │  Mode   │  Model  │Thinking │ Commit  │ Review  │  /cmd   │ Preset  │  Macro  │
 * ├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
 * │Activity │ Tokens  │ Context │ Context%│  Cost   │ Timer   │   Git   │   MCP   │
 * ├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
 * │ Claude  │  Aider  │  Codex  │ Gemini  │OpenCode │ Active  │Analytics│Settings │
 * └─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘
 */
export const xlLayout: ProfileLayout = {
  device: devices.xl,
  actions: [
    // Row 0 - Primary controls
    { uuid: action("approve"), row: 0, column: 0 },
    { uuid: action("reject"), row: 0, column: 1 },
    { uuid: action("interrupt"), row: 0, column: 2 },
    { uuid: action("continue-session"), row: 0, column: 3 },
    { uuid: action("new-session"), row: 0, column: 4 },
    { uuid: action("session-picker"), row: 0, column: 5 },
    { uuid: action("yolo-mode"), row: 0, column: 6 },
    { uuid: action("plan-mode"), row: 0, column: 7 },
    // Row 1 - Mode/Model/Commands
    { uuid: action("mode-display"), row: 1, column: 0 },
    { uuid: action("model-display"), row: 1, column: 1 },
    { uuid: action("toggle-thinking"), row: 1, column: 2 },
    { uuid: action("slash-commit"), row: 1, column: 3 },
    { uuid: action("slash-review"), row: 1, column: 4 },
    { uuid: action("slash-command"), row: 1, column: 5 },
    { uuid: action("prompt-preset"), row: 1, column: 6 },
    { uuid: action("macro"), row: 1, column: 7 },
    // Row 2 - Info displays
    { uuid: action("activity-display"), row: 2, column: 0 },
    { uuid: action("token-display"), row: 2, column: 1 },
    { uuid: action("context-bar"), row: 2, column: 2 },
    { uuid: action("context-percent"), row: 2, column: 3 },
    { uuid: action("cost-display"), row: 2, column: 4 },
    { uuid: action("session-timer"), row: 2, column: 5 },
    { uuid: action("git-status"), row: 2, column: 6 },
    { uuid: action("mcp-status"), row: 2, column: 7 },
    // Row 3 - Agent badges & settings
    {
      uuid: action("agent-badge"),
      row: 3,
      column: 0,
      settings: { agentId: "claude" },
    },
    {
      uuid: action("agent-badge"),
      row: 3,
      column: 1,
      settings: { agentId: "aider" },
    },
    {
      uuid: action("agent-badge"),
      row: 3,
      column: 2,
      settings: { agentId: "codex" },
    },
    {
      uuid: action("agent-badge"),
      row: 3,
      column: 3,
      settings: { agentId: "gemini" },
    },
    {
      uuid: action("agent-badge"),
      row: 3,
      column: 4,
      settings: { agentId: "opencode" },
    },
    { uuid: action("active-agent-display"), row: 3, column: 5 },
    { uuid: action("usage-analytics"), row: 3, column: 6 },
    { uuid: action("settings"), row: 3, column: 7 },
  ],
};

/**
 * Pedal Layout (3 buttons, 3x1)
 * Hands-free essential controls
 *
 * ┌─────────┬─────────┬─────────┐
 * │ Approve │ Reject  │Interrupt│
 * └─────────┴─────────┴─────────┘
 */
export const pedalLayout: ProfileLayout = {
  device: devices.pedal,
  actions: [
    { uuid: action("approve"), row: 0, column: 0 },
    { uuid: action("reject"), row: 0, column: 1 },
    { uuid: action("interrupt"), row: 0, column: 2 },
  ],
};

// Export all layouts
export const allLayouts: ProfileLayout[] = [
  miniLayout,
  neoLayout,
  plusLayout,
  standardLayout,
  xlLayout,
  pedalLayout,
];
