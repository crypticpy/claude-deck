# Product Requirements Document: Multi-Agent Support for AI Deck

**Version**: 1.0
**Date**: January 2026
**Status**: Draft

---

## 1. Executive Summary

### 1.1 Overview
Expand Claude Deck into **AI Deck** - a universal Stream Deck plugin that controls multiple AI coding agents from a single interface. Users can run Claude Code, Codex, Gemini CLI, OpenCode, Aider, and other tools in different terminal windows simultaneously, with the Stream Deck automatically adapting to whichever agent is currently focused.

### 1.2 Goals
1. Support multiple coding agents in parallel across different terminal sessions
2. Provide unified control surface with consistent UX across all agents
3. Automatically detect and switch context based on focused terminal window
4. Enable spawning new agent sessions directly from Stream Deck buttons
5. Target Stream Deck XL (8x4 = 32 buttons) as the primary layout

### 1.3 Non-Goals (v1.0)
- Windows/Linux support (macOS only for initial release)
- IDE-based agents (Continue, Cursor) - CLI agents only
- Multi-machine control (single machine only)

---

## 2. Market Research: Supported Coding Agents

### 2.1 Agent Integration Tiers

| Tier | Agent | Integration Difficulty | Reason |
|------|-------|----------------------|--------|
| **Tier 1** | Claude Code | Easy | Full hooks API, file-based IPC, reference implementation |
| **Tier 1** | Aider | Easy-Medium | File-based state, well-documented commands |
| **Tier 2** | OpenCode | Medium | Go TUI with project-local state files |
| **Tier 2** | Codex CLI | Medium | MCP support, config.toml, slash commands |
| **Tier 2** | Gemini CLI | Medium | MCP support, built-in tools, --yolo flag |
| **Tier 3** | Factory Droid | Hard | Tiered autonomy, primarily cloud-based |
| **Tier 3** | Continue | Hard | IDE-native, not terminal-native |

### 2.2 Agent Capabilities Matrix

| Agent | Approve/Reject | Interrupt | Model Switch | Mode Cycle | Slash Cmds | State File | MCP |
|-------|---------------|-----------|--------------|------------|------------|------------|-----|
| Claude Code | y/n | Ctrl+C | Alt+P | Shift+Tab | Yes | state.json | Yes |
| Aider | Auto | Ctrl+C | --model | N/A | /slash | .aider.* | No |
| OpenCode | y/n | Ctrl+C | --model | N/A | Limited | .opencode/ | No |
| Codex CLI | y/n | Ctrl+C | --model | --yolo | /slash | config.toml | Yes |
| Gemini CLI | y/n | Ctrl+C | --model | --yolo | Limited | ~/.gemini/ | Yes |
| Factory Droid | y/n | API | --model | Autonomy | /mcp | Cloud | Yes |

### 2.3 Launch Commands

```bash
# Claude Code
claude                           # Interactive
claude -c                        # Continue session
claude --model opus              # Specific model

# Codex CLI
codex                            # Interactive
codex --yolo                     # Auto-approve mode
codex --model gpt-5              # Model selection

# Gemini CLI
gemini                           # Interactive
gemini -p "prompt"               # Single prompt
gemini --yolo                    # Auto-approve

# OpenCode
opencode                         # Interactive TUI
opencode -d                      # Debug mode
opencode --provider anthropic    # Provider selection

# Aider
aider                            # Interactive
aider --opus                     # Use Claude Opus
aider --auto-commits             # Auto-commit mode

# Factory Droid
droid                            # Interactive
droid --mode autonomous          # Full autonomous
```

---

## 3. Stream Deck XL Layout Strategy

### 3.1 Primary Layout: "Universal Control + Tool Switcher"

The recommended layout uses a hybrid approach optimized for Stream Deck XL (32 buttons):

```
┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
│    ✓    │    ✕    │    ⏹    │    ↩    │    +    │   📋    │ [Active │ [Tool   │
│ APPROVE │ REJECT  │  STOP   │ CONTINUE│   NEW   │  PASTE  │  Tool]  │ Picker] │
│   ALL   │   ALL   │   ALL   │  (ctx)  │  (ctx)  │ Clipbrd │  Badge  │         │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│  Mode   │  Model  │  YOLO   │  Plan   │  Think  │ [Cost]  │ [Ctx %] │[Status] │
│  Cycle  │ Switch  │  Mode   │  Mode   │  Toggle │  $0.42  │ ▓▓▓65%  │ Working │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│ /commit │ /review │ Slash 1 │ Slash 2 │ Slash 3 │ Slash 4 │  Macro  │  Export │
│         │         │ (cfg)   │ (cfg)   │ (cfg)   │ (cfg)   │  Button │ Session │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│ Claude  │  Codex  │ Gemini  │  Aider  │OpenCode │ Custom  │ [Timer] │  [Git]  │
│ [🟣●]   │ [🟢○]   │ [🔵○]   │ [🟡○]   │ [🟠○]   │ Agent   │  12:34  │  main*  │
└─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘

LEGEND:
● = Active/focused tool (filled circle, saturated color)
○ = Running but not focused (hollow circle, muted color)
(ctx) = Context-sensitive - applies to active tool
(cfg) = User-configurable per tool
```

### 3.2 Row Functions

| Row | Function | Behavior |
|-----|----------|----------|
| **Row 1** | Universal Controls | Actions apply to whichever tool is focused |
| **Row 2** | Active Tool Settings | Toggles/settings specific to the active tool |
| **Row 3** | Commands & Macros | Slash commands, user-defined actions |
| **Row 4** | Tool Switcher + Status | One button per tool, plus global displays |

### 3.3 Tool Switcher Behavior

Each tool badge button (Row 4) has three functions:
1. **Display**: Shows tool status (idle/working/waiting/error/disconnected)
2. **Short Press**: Switch focus to this tool (make it "active")
3. **Long Press**: Spawn new session of this tool in a new terminal window

### 3.4 Alternative Layouts

#### Dashboard Mode (Multi-Tool Monitoring)
For users running 2-4 agents simultaneously who need visibility into all:

```
┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
│ CLAUDE  │ Claude  │ Claude  │ Claude  │  CODEX  │  Codex  │  Codex  │  Codex  │
│ STATUS  │ Approve │ Reject  │  Stop   │  STATUS │ Approve │ Reject  │  Stop   │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│ [Cost]  │ [Ctx%]  │ /commit │ Details │ [Cost]  │ [Ctx%]  │ Command │ Details │
│ $0.42   │  65%    │         │   →     │  Free   │   --    │         │   →     │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│ GEMINI  │ Gemini  │ Gemini  │ Gemini  │  AIDER  │  Aider  │  Aider  │  Aider  │
│ STATUS  │ Approve │ Reject  │  Stop   │  STATUS │ Approve │ Reject  │  Stop   │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│ [Cost]  │ [Ctx%]  │ Command │ Details │ [Cost]  │ [Ctx%]  │ /commit │ Details │
│ $0.08   │  22%    │         │   →     │ $0.15   │  40%    │         │   →     │
└─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘
```

#### Tool-Specific Pages
Full control surface per tool with page navigation:

- **Page 1**: Claude Code (32 buttons, full control)
- **Page 2**: Codex CLI (32 buttons, full control)
- **Page 3**: Gemini CLI (32 buttons, full control)
- **Page 4**: Settings & Configuration

---

## 4. Technical Architecture

### 4.1 Renamed Project Structure

```
ai-deck/                              # Renamed from claude-deck
├── src/
│   ├── agents/                       # NEW: Agent-specific adapters
│   │   ├── base-agent.ts             # Abstract base class
│   │   ├── claude-agent.ts           # Claude Code adapter
│   │   ├── codex-agent.ts            # Codex CLI adapter
│   │   ├── gemini-agent.ts           # Gemini CLI adapter
│   │   ├── aider-agent.ts            # Aider adapter
│   │   ├── opencode-agent.ts         # OpenCode adapter
│   │   └── index.ts                  # Agent registry
│   ├── actions/                      # Stream Deck actions
│   │   ├── universal/                # Cross-agent actions
│   │   │   ├── approve.ts
│   │   │   ├── reject.ts
│   │   │   ├── interrupt.ts
│   │   │   └── tool-picker.ts
│   │   ├── agent-specific/           # Per-agent actions
│   │   │   ├── claude/
│   │   │   ├── codex/
│   │   │   └── ...
│   │   └── displays/                 # Status displays
│   ├── utils/
│   │   ├── agent-controller.ts       # Replaces claude-controller.ts
│   │   ├── terminal-detector.ts      # NEW: Detect focused terminal
│   │   └── state-aggregator.ts       # NEW: Merge all agent states
│   └── plugin.ts
├── com.ai-deck.sdPlugin/             # Renamed plugin
│   ├── manifest.json
│   └── ...
└── docs/
    └── PRD-MULTI-AGENT.md            # This document
```

### 4.2 Agent Adapter Interface

```typescript
// src/agents/base-agent.ts
export interface AgentCapabilities {
  approve: boolean;
  reject: boolean;
  interrupt: boolean;
  modelSwitch: boolean;
  modeSwitch: boolean;
  yoloMode: boolean;
  planMode: boolean;
  slashCommands: string[];
  stateFile: boolean;
}

export interface AgentState {
  id: string;
  name: string;
  active: boolean;
  status: "idle" | "working" | "waiting" | "error" | "disconnected";
  hasPermissionPending: boolean;
  model?: string;
  mode?: string;
  contextPercent?: number;
  cost?: number;
  tokens?: { input: number; output: number };
  terminalPid?: number;
}

export abstract class BaseAgentAdapter {
  abstract id: string;
  abstract name: string;
  abstract color: string;
  abstract capabilities: AgentCapabilities;

  // Lifecycle
  abstract isInstalled(): Promise<boolean>;
  abstract isRunning(): Promise<boolean>;
  abstract detectSession(): Promise<AgentState | null>;

  // Spawning
  abstract spawnSession(options?: SpawnOptions): Promise<void>;
  abstract continueSession(): Promise<void>;

  // Control
  abstract approve(): Promise<boolean>;
  abstract reject(): Promise<boolean>;
  abstract interrupt(): Promise<boolean>;
  abstract sendKeystroke(key: string, modifiers?: string[]): Promise<boolean>;
  abstract sendCommand(command: string): Promise<boolean>;

  // State
  abstract getState(): Promise<AgentState>;
  abstract watchState(callback: (state: AgentState) => void): void;
  abstract stopWatching(): void;
}
```

### 4.3 State Aggregation

```typescript
// src/utils/state-aggregator.ts
export interface AggregatedState {
  activeAgentId: string | null;
  agents: Map<string, AgentState>;
  lastUpdate: Date;
}

export class StateAggregator extends EventEmitter {
  private agents: Map<string, BaseAgentAdapter> = new Map();
  private currentState: AggregatedState;

  // Register agents at startup
  registerAgent(adapter: BaseAgentAdapter): void;

  // Get current state
  getState(): AggregatedState;

  // Switch active agent
  setActiveAgent(agentId: string): void;

  // Start watching all agents
  startWatching(): void;

  // Detect which agent's terminal is focused
  async detectFocusedAgent(): Promise<string | null>;
}
```

### 4.4 Terminal Detection

```typescript
// src/utils/terminal-detector.ts
export interface TerminalWindow {
  pid: number;
  title: string;
  app: TerminalType;
  agentId?: string;  // Which agent is running in this terminal
}

export class TerminalDetector {
  // Get frontmost terminal info
  async getFocusedTerminal(): Promise<TerminalWindow | null>;

  // List all terminal windows
  async listTerminals(): Promise<TerminalWindow[]>;

  // Detect which agent is running in a terminal (by process tree)
  async detectAgentInTerminal(pid: number): Promise<string | null>;

  // Watch for terminal focus changes
  watchFocusChanges(callback: (window: TerminalWindow | null) => void): void;
}
```

### 4.5 State File Locations

| Agent | State File Path | Format |
|-------|----------------|--------|
| Claude Code | `~/.claude-deck/state.json` | JSON |
| Claude Code | `/tmp/claude-context-stats.json` | JSON (context) |
| Aider | `.aider.chat.history.md` | Markdown |
| Aider | `.aider.lock` | Lock file |
| OpenCode | `.opencode/session.json` | JSON |
| Codex CLI | `~/.codex/config.toml` | TOML |
| Gemini CLI | `~/.gemini/config.json` | JSON |

### 4.6 Configuration

```json
// ~/.ai-deck/config.json
{
  "terminal": {
    "type": "kitty"
  },
  "layout": {
    "mode": "primary",  // "primary" | "dashboard" | "pages"
    "primaryAgent": "claude"
  },
  "agents": {
    "claude": {
      "enabled": true,
      "color": "#AF52DE",
      "defaultModel": "opus"
    },
    "codex": {
      "enabled": true,
      "color": "#00C853",
      "apiKey": "${OPENAI_API_KEY}"
    },
    "gemini": {
      "enabled": true,
      "color": "#4285F4"
    },
    "aider": {
      "enabled": true,
      "color": "#FFC107",
      "autoCommit": true
    },
    "opencode": {
      "enabled": false
    }
  },
  "autoSwitchOnFocus": true,
  "showInactiveAgents": true
}
```

---

## 5. User Experience

### 5.1 First-Run Experience

1. Plugin detects which agents are installed (checks PATH)
2. Shows configuration wizard in Stream Deck app
3. User selects which agents to enable
4. User chooses layout mode (Primary/Dashboard/Pages)
5. Default button layout is applied

### 5.2 Day-to-Day Usage

**Scenario: User has Claude and Codex running in separate terminals**

1. User clicks in Claude's terminal window
2. Stream Deck automatically detects focus change
3. Active Tool badge updates to show Claude (filled circle)
4. Codex badge shows hollow circle (running but not focused)
5. All Row 1-3 buttons now target Claude
6. User presses Approve button → sends 'y' to Claude's terminal

**Scenario: User wants to start a new Gemini session**

1. User long-presses Gemini badge in Row 4
2. New Kitty window opens with `gemini` command
3. Gemini badge transitions from "disconnected" to "working"
4. Auto-focus switches active tool to Gemini

### 5.3 Visual Feedback

| State | Badge Appearance |
|-------|------------------|
| Disconnected | Gray, hollow circle, dimmed |
| Running + Not Focused | Agent color, hollow circle |
| Running + Focused | Agent color, filled circle, glow effect |
| Waiting for Input | Pulsing animation |
| Error | Red border overlay |

### 5.4 Keyboard Shortcuts

Users can combine Stream Deck with keyboard for power workflows:

| Action | Stream Deck | Keyboard (in terminal) |
|--------|-------------|------------------------|
| Approve | Approve button | y + Enter |
| Reject | Reject button | n + Enter |
| Switch to Claude | Claude badge | Cmd+1 (custom) |
| Switch to Codex | Codex badge | Cmd+2 (custom) |

---

## 6. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- [ ] Rename project to "AI Deck"
- [ ] Refactor `claude-controller.ts` into `base-agent.ts` abstract class
- [ ] Create `claude-agent.ts` that extends base class
- [ ] Implement `state-aggregator.ts` for multi-agent state
- [ ] Create `terminal-detector.ts` for focus detection
- [ ] Update existing actions to use new controller pattern

### Phase 2: Aider Integration (Weeks 3-4)
- [ ] Create `aider-agent.ts` adapter
- [ ] Implement Aider state detection (lock file, history parsing)
- [ ] Add Aider-specific slash commands
- [ ] Test dual-agent operation (Claude + Aider)

### Phase 3: Codex & Gemini (Weeks 5-6)
- [ ] Create `codex-agent.ts` adapter
- [ ] Create `gemini-agent.ts` adapter
- [ ] Implement MCP-based state detection
- [ ] Add tool-specific configuration options

### Phase 4: UI Polish (Weeks 7-8)
- [ ] Implement Dashboard layout mode
- [ ] Implement Tool-Specific Pages mode
- [ ] Add visual transitions for focus changes
- [ ] Create configuration UI for Stream Deck app

### Phase 5: Advanced Features (Weeks 9-10)
- [ ] Multi-action macros (cross-tool workflows)
- [ ] Session persistence/restoration
- [ ] Usage analytics (aggregate cost across tools)
- [ ] Custom agent support (user-defined adapters)

---

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| Agents supported at launch | 5+ (Claude, Aider, Codex, Gemini, OpenCode) |
| Focus detection latency | <200ms |
| State update frequency | 500ms polling with file watch acceleration |
| User-reported bugs (launch week) | <10 |
| GitHub stars (month 1) | 500+ |

---

## 8. Open Questions

1. **Agent detection**: Should we use process-tree inspection or expect users to launch from Stream Deck for tracking?

2. **State file pollution**: Each agent writes different state formats. Do we normalize to a common format or read each native format?

3. **Conflict handling**: What happens if user presses Approve while switching focus between tools?

4. **Windows/Linux**: Is there demand for cross-platform support in v1.1?

5. **Plugin name**: "AI Deck" vs "Code Deck" vs "Agent Deck" vs keeping "Claude Deck" with multi-agent support?

---

## 9. References

### Documentation
- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference/)
- [Gemini CLI GitHub](https://github.com/google-gemini/gemini-cli)
- [Aider Documentation](https://aider.chat/docs/)
- [OpenCode GitHub](https://github.com/opencode-ai/opencode)
- [Factory Droid CLI Reference](https://docs.factory.ai/reference/cli-reference)
- [Claude Code Status Line](https://code.claude.com/docs/en/statusline)
- [Stream Deck SDK](https://developer.elgato.com/documentation/stream-deck/)

### Inspiration
- OBS Studio Plugin (multi-scene control)
- Elgato Wave Link (multi-source audio)
- Philips Hue Plugin (room/zone organization)

---

## Appendix A: Agent-Specific Slash Commands

### Claude Code
```
/commit, /review, /init, /doctor, /help, /config
```

### Aider
```
/add, /drop, /clear, /commit, /diff, /git, /help, /lint, /run, /tokens, /undo, /voice, /web, /quit
```

### Codex CLI
```
/model, /init, /review, /diff
```

### Gemini CLI
```
Limited - uses tool calls instead of slash commands
```

---

## Appendix B: Color Palette

| Agent | Primary Color | Hex | Status Colors |
|-------|--------------|-----|---------------|
| Claude | Purple | #AF52DE | Standard (green/yellow/red) |
| Codex | Green | #00C853 | Standard |
| Gemini | Blue | #4285F4 | Standard |
| Aider | Amber | #FFC107 | Standard |
| OpenCode | Orange | #FF9800 | Standard |
| Factory | Cyan | #00BCD4 | Standard |

**Status Colors (Universal)**
- Idle: #888888 (Gray)
- Working: #00FF00 (Green)
- Waiting: #FFFF00 (Yellow)
- Error: #FF3B30 (Red)
- Disconnected: #444444 (Dark Gray)
