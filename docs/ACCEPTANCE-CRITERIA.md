# Acceptance Criteria: AI Deck Multi-Agent Support

**Version**: 1.0
**Date**: January 2026

---

## Table of Contents
1. [System-Wide Acceptance Criteria](#1-system-wide-acceptance-criteria)
2. [Claude Code Integration](#2-claude-code-integration)
3. [Aider Integration](#3-aider-integration)
4. [Codex CLI Integration](#4-codex-cli-integration)
5. [Gemini CLI Integration](#5-gemini-cli-integration)
6. [OpenCode Integration](#6-opencode-integration)
7. [Factory Droid Integration](#7-factory-droid-integration)
8. [Stream Deck XL Layout](#8-stream-deck-xl-layout)
9. [Performance & Reliability](#9-performance--reliability)

---

## 1. System-Wide Acceptance Criteria

### 1.1 Multi-Agent Core

| ID | Criteria | Test Method |
|----|----------|-------------|
| SYS-001 | System SHALL support running 2+ agents simultaneously in separate terminal windows | Launch Claude and Aider in separate terminals; verify both detected |
| SYS-002 | System SHALL detect which agent's terminal window is currently focused within 500ms | Switch focus between terminals; verify badge updates |
| SYS-003 | Universal actions (Approve/Reject/Stop) SHALL target the currently focused agent | Focus Claude terminal → press Approve → verify 'y' sent to Claude only |
| SYS-004 | System SHALL gracefully handle agents that are not installed | Disable Codex in config; verify no errors, badge shows "not installed" |
| SYS-005 | System SHALL persist agent enable/disable preferences across restarts | Toggle agent off → restart plugin → verify still disabled |
| SYS-006 | System SHALL aggregate cost/token metrics across all active agents | Run Claude and Aider; verify total cost display sums both |

### 1.2 State Management

| ID | Criteria | Test Method |
|----|----------|-------------|
| STATE-001 | Each agent's state file SHALL be watched independently | Modify Claude's state.json → verify only Claude badge updates |
| STATE-002 | State SHALL update within 2 seconds of agent state change | Trigger permission request in Claude → verify badge shows "waiting" within 2s |
| STATE-003 | Disconnected agents SHALL show distinct visual state | Kill Claude process → verify badge shows gray/disconnected state |
| STATE-004 | State aggregator SHALL emit events when any agent's state changes | Subscribe to stateChange event; verify fires for each agent update |
| STATE-005 | Corrupted state files SHALL NOT crash the plugin | Write invalid JSON to state file → verify plugin continues with default state |

### 1.3 Terminal Detection

| ID | Criteria | Test Method |
|----|----------|-------------|
| TERM-001 | System SHALL detect Kitty terminal focus | Focus Kitty window → verify detection callback fires |
| TERM-002 | System SHALL detect Ghostty terminal focus | Focus Ghostty window → verify detection callback fires |
| TERM-003 | System SHALL detect iTerm2 terminal focus | Focus iTerm2 window → verify detection callback fires |
| TERM-004 | System SHALL detect Terminal.app focus | Focus Terminal.app → verify detection callback fires |
| TERM-005 | System SHALL detect WezTerm focus | Focus WezTerm → verify detection callback fires |
| TERM-006 | System SHALL detect Alacritty focus | Focus Alacritty → verify detection callback fires |
| TERM-007 | System SHALL identify which agent is running in focused terminal | Focus terminal with Claude → verify activeAgentId = "claude" |
| TERM-008 | Non-terminal apps SHALL NOT trigger agent switch | Focus VS Code → verify activeAgentId unchanged |

### 1.4 Configuration

| ID | Criteria | Test Method |
|----|----------|-------------|
| CFG-001 | Config file SHALL be created with defaults on first run | Delete config → start plugin → verify config created |
| CFG-002 | Config changes SHALL take effect without plugin restart | Edit config.json → verify change reflected within 5s |
| CFG-003 | Invalid config values SHALL fall back to defaults | Set invalid terminal type → verify falls back to "kitty" |
| CFG-004 | Per-agent settings SHALL override global defaults | Set agent-specific model → verify used instead of global |

---

## 2. Claude Code Integration

### 2.1 Detection & State

| ID | Criteria | Test Method |
|----|----------|-------------|
| CLAUDE-001 | System SHALL detect Claude Code installation via `which claude` | Run on system with Claude installed → verify isInstalled() = true |
| CLAUDE-002 | System SHALL detect running Claude session via process detection | Start Claude → verify isRunning() = true |
| CLAUDE-003 | System SHALL read state from `~/.claude-deck/state.json` | Update state.json → verify getState() reflects changes |
| CLAUDE-004 | System SHALL read context stats from `/tmp/claude-context-stats.json` | Verify contextPercent matches stats file |
| CLAUDE-005 | System SHALL parse session cost from statusline JSON | Verify cost display matches session cost |
| CLAUDE-006 | System SHALL detect model (Sonnet/Opus/Haiku) from state | Switch model in Claude → verify badge updates |

### 2.2 Actions

| ID | Criteria | Test Method |
|----|----------|-------------|
| CLAUDE-010 | Approve button SHALL send 'y' keystroke to Claude terminal | Press Approve → verify permission accepted |
| CLAUDE-011 | Reject button SHALL send 'n' keystroke to Claude terminal | Press Reject → verify permission denied |
| CLAUDE-012 | Interrupt button SHALL send Ctrl+C to Claude terminal | Press Interrupt → verify operation cancelled |
| CLAUDE-013 | Continue button SHALL spawn `claude -c` in new terminal | Press Continue → verify new terminal opens with continued session |
| CLAUDE-014 | New Session button SHALL spawn `claude` in new terminal | Press New → verify new terminal opens with fresh session |
| CLAUDE-015 | Mode Cycle SHALL send Shift+Tab and update local state | Press Mode Cycle → verify mode changes (NORMAL→PLAN→EDITS) |
| CLAUDE-016 | Model Switch SHALL send Alt+P keystroke | Press Model Switch → verify model cycles |
| CLAUDE-017 | Toggle Thinking SHALL send Alt+T keystroke | Press Toggle Thinking → verify thinking mode changes |
| CLAUDE-018 | YOLO Mode SHALL be unavailable (requires CLI flag) | Verify YOLO button disabled or shows warning |

### 2.3 Slash Commands

| ID | Criteria | Test Method |
|----|----------|-------------|
| CLAUDE-020 | /commit button SHALL type "/commit" + Enter | Press Commit → verify text typed in terminal |
| CLAUDE-021 | /review button SHALL type "/review" + Enter | Press Review → verify text typed in terminal |
| CLAUDE-022 | Custom slash command buttons SHALL type configured command | Configure "/doctor" → press → verify typed |

### 2.4 Displays

| ID | Criteria | Test Method |
|----|----------|-------------|
| CLAUDE-030 | Context Bar SHALL show percentage toward 154K threshold | At 77K tokens → verify shows ~50% |
| CLAUDE-031 | Context Bar SHALL change color based on remaining capacity | At 140K → verify bar is red |
| CLAUDE-032 | Cost Display SHALL show session cost in USD | Verify matches Claude's reported cost |
| CLAUDE-033 | Token Display SHALL show input/output token counts | Verify matches session tokens |
| CLAUDE-034 | Session Timer SHALL show elapsed time | Verify increments correctly |
| CLAUDE-035 | Status Display SHALL show idle/working/waiting states | Trigger each state → verify display updates |

---

## 3. Aider Integration

### 3.1 Detection & State

| ID | Criteria | Test Method |
|----|----------|-------------|
| AIDER-001 | System SHALL detect Aider installation via `which aider` | Run on system with Aider installed → verify isInstalled() = true |
| AIDER-002 | System SHALL detect running Aider via `.aider.lock` file | Start Aider → verify lock file detected |
| AIDER-003 | System SHALL detect running Aider via process detection | Start Aider → verify isRunning() = true |
| AIDER-004 | System SHALL parse chat history from `.aider.chat.history.md` | Verify history file read without error |
| AIDER-005 | System SHALL detect model from Aider config/flags | Start with --opus → verify model detected |
| AIDER-006 | Session detection SHALL work in subdirectories | Start Aider in project root, cd to subdir → verify still detected |

### 3.2 Actions

| ID | Criteria | Test Method |
|----|----------|-------------|
| AIDER-010 | Interrupt button SHALL send Ctrl+C to Aider terminal | Press Interrupt → verify operation cancelled |
| AIDER-011 | Continue button SHALL spawn `aider` in project directory | Press Continue → verify new terminal in correct dir |
| AIDER-012 | New Session button SHALL spawn `aider` with configured flags | Press New → verify spawns with --opus if configured |

### 3.3 Slash Commands

| ID | Criteria | Test Method |
|----|----------|-------------|
| AIDER-020 | /commit button SHALL type "/commit" + Enter | Press Commit → verify command sent |
| AIDER-021 | /undo button SHALL type "/undo" + Enter | Press Undo → verify command sent |
| AIDER-022 | /diff button SHALL type "/diff" + Enter | Press Diff → verify command sent |
| AIDER-023 | /add button SHALL type "/add " (awaiting filename) | Press Add → verify partial command typed |
| AIDER-024 | /drop button SHALL type "/drop " (awaiting filename) | Press Drop → verify partial command typed |
| AIDER-025 | /tokens button SHALL type "/tokens" + Enter | Press Tokens → verify command sent |
| AIDER-026 | /lint button SHALL type "/lint" + Enter | Press Lint → verify command sent |
| AIDER-027 | /voice button SHALL type "/voice" + Enter | Press Voice → verify command sent |

### 3.4 Displays

| ID | Criteria | Test Method |
|----|----------|-------------|
| AIDER-030 | Status SHALL show working when Aider is generating | Start generation → verify status = working |
| AIDER-031 | Status SHALL show idle when Aider awaits input | Stop generation → verify status = idle |
| AIDER-032 | Git Status SHALL reflect repository state | Make changes → verify git status updates |

---

## 4. Codex CLI Integration

### 4.1 Detection & State

| ID | Criteria | Test Method |
|----|----------|-------------|
| CODEX-001 | System SHALL detect Codex installation via `which codex` | Run on system with Codex installed → verify isInstalled() = true |
| CODEX-002 | System SHALL detect running Codex via process detection | Start Codex → verify isRunning() = true |
| CODEX-003 | System SHALL read config from `~/.codex/config.toml` | Verify config parsed without error |
| CODEX-004 | System SHALL detect model from config or flags | Start with --model gpt-5 → verify model detected |

### 4.2 Actions

| ID | Criteria | Test Method |
|----|----------|-------------|
| CODEX-010 | Approve button SHALL send 'y' keystroke | Press Approve → verify permission accepted |
| CODEX-011 | Reject button SHALL send 'n' keystroke | Press Reject → verify permission denied |
| CODEX-012 | Interrupt button SHALL send Ctrl+C | Press Interrupt → verify cancelled |
| CODEX-013 | New Session button SHALL spawn `codex` | Press New → verify new terminal opens |
| CODEX-014 | YOLO Mode button SHALL spawn `codex --yolo` | Press YOLO → verify spawned with flag |
| CODEX-015 | Full Auto button SHALL spawn `codex --full-auto` | Press Full Auto → verify spawned with flag |

### 4.3 Slash Commands

| ID | Criteria | Test Method |
|----|----------|-------------|
| CODEX-020 | /model button SHALL type "/model" + Enter | Press Model → verify command sent |
| CODEX-021 | /init button SHALL type "/init" + Enter | Press Init → verify command sent |
| CODEX-022 | /review button SHALL type "/review" + Enter | Press Review → verify command sent |
| CODEX-023 | /diff button SHALL type "/diff" + Enter | Press Diff → verify command sent |

### 4.4 Displays

| ID | Criteria | Test Method |
|----|----------|-------------|
| CODEX-030 | Model badge SHALL show current model (GPT-5-Codex, GPT-5) | Verify model displayed correctly |
| CODEX-031 | Status SHALL reflect working/idle states | Verify status updates on state change |

---

## 5. Gemini CLI Integration

### 5.1 Detection & State

| ID | Criteria | Test Method |
|----|----------|-------------|
| GEMINI-001 | System SHALL detect Gemini installation via `which gemini` | Run on system with Gemini → verify isInstalled() = true |
| GEMINI-002 | System SHALL detect running Gemini via process detection | Start Gemini → verify isRunning() = true |
| GEMINI-003 | System SHALL read config from `~/.gemini/` | Verify config directory read |
| GEMINI-004 | System SHALL detect model (gemini-2.5-pro, etc.) | Verify model detected from session |

### 5.2 Actions

| ID | Criteria | Test Method |
|----|----------|-------------|
| GEMINI-010 | Approve button SHALL send 'y' keystroke | Press Approve → verify permission accepted |
| GEMINI-011 | Reject button SHALL send 'n' keystroke | Press Reject → verify permission denied |
| GEMINI-012 | Interrupt button SHALL send Ctrl+C | Press Interrupt → verify cancelled |
| GEMINI-013 | New Session button SHALL spawn `gemini` | Press New → verify new terminal opens |
| GEMINI-014 | YOLO Mode button SHALL spawn `gemini --yolo` | Press YOLO → verify spawned with flag |

### 5.3 Built-in Tools

| ID | Criteria | Test Method |
|----|----------|-------------|
| GEMINI-020 | System SHALL recognize GoogleSearch tool usage | Verify tool tracked in state |
| GEMINI-021 | System SHALL recognize Shell tool usage | Verify shell commands tracked |
| GEMINI-022 | System SHALL recognize WebFetch tool usage | Verify web fetches tracked |

### 5.4 Displays

| ID | Criteria | Test Method |
|----|----------|-------------|
| GEMINI-030 | Model badge SHALL show Gemini model variant | Verify model displayed |
| GEMINI-031 | Status SHALL reflect tool execution states | Verify status updates during tool use |
| GEMINI-032 | Context SHALL show usage toward 1M token window | Verify context percentage calculated correctly |

---

## 6. OpenCode Integration

### 6.1 Detection & State

| ID | Criteria | Test Method |
|----|----------|-------------|
| OPENCODE-001 | System SHALL detect OpenCode installation via `which opencode` | Verify isInstalled() = true |
| OPENCODE-002 | System SHALL detect running OpenCode via process detection | Start OpenCode → verify isRunning() = true |
| OPENCODE-003 | System SHALL read state from `.opencode/session.json` | Verify state file read |
| OPENCODE-004 | System SHALL detect provider (OpenAI, Anthropic, etc.) | Verify provider detected from config |

### 6.2 Actions

| ID | Criteria | Test Method |
|----|----------|-------------|
| OPENCODE-010 | Approve button SHALL send 'y' keystroke | Press Approve → verify accepted |
| OPENCODE-011 | Reject button SHALL send 'n' keystroke | Press Reject → verify rejected |
| OPENCODE-012 | Interrupt button SHALL send Ctrl+C | Press Interrupt → verify cancelled |
| OPENCODE-013 | New Session button SHALL spawn `opencode` | Press New → verify spawned |

### 6.3 Displays

| ID | Criteria | Test Method |
|----|----------|-------------|
| OPENCODE-030 | Provider badge SHALL show active provider | Verify provider displayed |
| OPENCODE-031 | Model badge SHALL show active model | Verify model displayed |
| OPENCODE-032 | Status SHALL reflect TUI state | Verify status updates |

---

## 7. Factory Droid Integration

### 7.1 Detection & State

| ID | Criteria | Test Method |
|----|----------|-------------|
| DROID-001 | System SHALL detect Droid installation via `which droid` | Verify isInstalled() = true |
| DROID-002 | System SHALL detect running Droid via process detection | Start Droid → verify isRunning() = true |
| DROID-003 | System SHALL detect autonomy level (default/low/medium/high) | Verify autonomy level detected |

### 7.2 Actions

| ID | Criteria | Test Method |
|----|----------|-------------|
| DROID-010 | Approve button SHALL send approval to Droid | Press Approve → verify accepted |
| DROID-011 | Reject button SHALL send rejection to Droid | Press Reject → verify rejected |
| DROID-012 | Interrupt button SHALL send Ctrl+C | Press Interrupt → verify cancelled |
| DROID-013 | New Session button SHALL spawn `droid` | Press New → verify spawned |
| DROID-014 | Autonomy buttons SHALL set autonomy level | Press each level → verify applied |

### 7.3 MCP Integration

| ID | Criteria | Test Method |
|----|----------|-------------|
| DROID-020 | /mcp button SHALL open MCP manager | Press MCP → verify manager opens |
| DROID-021 | System SHALL detect MCP server status | Verify MCP servers shown |

### 7.4 Displays

| ID | Criteria | Test Method |
|----|----------|-------------|
| DROID-030 | Autonomy badge SHALL show current level | Verify level displayed |
| DROID-031 | Status SHALL reflect task execution | Verify status updates during task |

---

## 8. Stream Deck XL Layout

### 8.1 Universal Control Row (Row 1)

| ID | Criteria | Test Method |
|----|----------|-------------|
| LAYOUT-001 | Approve button SHALL be at position (0,0) | Verify button placement |
| LAYOUT-002 | Reject button SHALL be at position (1,0) | Verify button placement |
| LAYOUT-003 | Stop button SHALL be at position (2,0) | Verify button placement |
| LAYOUT-004 | Continue button SHALL be at position (3,0) | Verify button placement |
| LAYOUT-005 | New button SHALL be at position (4,0) | Verify button placement |
| LAYOUT-006 | Paste button SHALL be at position (5,0) | Verify button placement |
| LAYOUT-007 | Active Tool badge SHALL be at position (6,0) | Verify button placement |
| LAYOUT-008 | Tool Picker SHALL be at position (7,0) | Verify button placement |

### 8.2 Tool Switcher Row (Row 4)

| ID | Criteria | Test Method |
|----|----------|-------------|
| LAYOUT-020 | Claude badge SHALL be at position (0,3) | Verify button placement |
| LAYOUT-021 | Codex badge SHALL be at position (1,3) | Verify button placement |
| LAYOUT-022 | Gemini badge SHALL be at position (2,3) | Verify button placement |
| LAYOUT-023 | Aider badge SHALL be at position (3,3) | Verify button placement |
| LAYOUT-024 | OpenCode badge SHALL be at position (4,3) | Verify button placement |
| LAYOUT-025 | Short press on badge SHALL switch active tool | Press Claude badge → verify Claude becomes active |
| LAYOUT-026 | Long press on badge SHALL spawn new session | Long press Claude → verify new terminal opens |

### 8.3 Visual States

| ID | Criteria | Test Method |
|----|----------|-------------|
| LAYOUT-030 | Active tool badge SHALL show filled circle | Verify filled circle on active |
| LAYOUT-031 | Running inactive tool badge SHALL show hollow circle | Verify hollow circle on running but not focused |
| LAYOUT-032 | Disconnected tool badge SHALL show gray/dimmed state | Kill agent → verify gray appearance |
| LAYOUT-033 | Waiting tool badge SHALL show pulsing animation | Trigger permission request → verify pulse |
| LAYOUT-034 | Error tool badge SHALL show red border | Trigger error → verify red border |

### 8.4 Layout Modes

| ID | Criteria | Test Method |
|----|----------|-------------|
| LAYOUT-040 | Primary mode SHALL show single active tool controls | Set mode=primary → verify layout |
| LAYOUT-041 | Dashboard mode SHALL show 4 tools with condensed controls | Set mode=dashboard → verify layout |
| LAYOUT-042 | Pages mode SHALL show full controls per page | Set mode=pages → verify navigation works |
| LAYOUT-043 | Layout mode SHALL be configurable in config.json | Change mode in config → verify layout updates |

---

## 9. Performance & Reliability

### 9.1 Latency

| ID | Criteria | Test Method |
|----|----------|-------------|
| PERF-001 | Focus detection SHALL complete within 200ms | Measure focus switch latency |
| PERF-002 | State updates SHALL reflect within 2 seconds | Measure time from agent state change to display update |
| PERF-003 | Button press to action SHALL complete within 100ms | Measure time from press to keystroke sent |
| PERF-004 | Plugin startup SHALL complete within 5 seconds | Measure time from launch to ready |

### 9.2 Resource Usage

| ID | Criteria | Test Method |
|----|----------|-------------|
| PERF-010 | Plugin SHALL use <100MB RAM with 5 agents enabled | Monitor memory usage |
| PERF-011 | CPU usage SHALL be <5% when idle | Monitor CPU during idle |
| PERF-012 | File watchers SHALL not exceed 10 per agent | Count file descriptors |

### 9.3 Error Handling

| ID | Criteria | Test Method |
|----|----------|-------------|
| ERR-001 | Plugin SHALL NOT crash on terminal focus loss | Kill terminal → verify plugin continues |
| ERR-002 | Plugin SHALL NOT crash on agent process crash | Kill agent process → verify plugin continues |
| ERR-003 | Plugin SHALL log errors to Stream Deck log | Trigger error → verify in log file |
| ERR-004 | Plugin SHALL recover from file system errors | Make state file unreadable → restore → verify recovers |
| ERR-005 | Plugin SHALL handle rapid focus changes gracefully | Switch focus rapidly → verify no race conditions |

### 9.4 Edge Cases

| ID | Criteria | Test Method |
|----|----------|-------------|
| EDGE-001 | Plugin SHALL handle no agents installed | Remove all agents → verify graceful empty state |
| EDGE-002 | Plugin SHALL handle all agents running simultaneously | Start all 6 agents → verify all tracked |
| EDGE-003 | Plugin SHALL handle same agent in multiple terminals | Start 2 Claude sessions → verify both detected |
| EDGE-004 | Plugin SHALL handle agent started after plugin | Start plugin → start agent → verify detected |
| EDGE-005 | Plugin SHALL handle terminal resize events | Resize terminal → verify no state loss |

---

## Appendix: Test Environment Requirements

### Hardware
- Stream Deck XL (32 buttons)
- macOS 13+ (Ventura or later)

### Software
- Stream Deck software v6.6+
- Node.js 20+
- All target agents installed

### Terminal Emulators (test at least 2)
- Kitty (primary)
- Ghostty
- iTerm2
- Terminal.app

### Test Projects
- Node.js project with package.json
- Python project with requirements.txt
- Git repository with uncommitted changes
