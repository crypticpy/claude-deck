# Claude Deck - Stream Deck Controller for Claude Code

## Vision

A Stream Deck plugin that provides tactile, one-button control over Claude Code sessions. No more typing `/commit` or fumbling for keyboard shortcuts - just press a button.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Stream Deck   │────▶│  Claude Deck     │────▶│   Claude Code   │
│    Hardware     │◀────│  Plugin (Node)   │◀────│   CLI/Session   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  State Bridge    │
                        │  (File Watcher)  │
                        └──────────────────┘
```

### Communication Methods

1. **CLI Invocation** - Execute `claude` commands directly for:
   - Starting new sessions with specific modes
   - Sending prompts in headless mode
   - Model switching

2. **File-Based IPC** - For real-time bidirectional communication:
   - Plugin writes commands to `~/.claude-deck/commands.json`
   - Claude Code hooks read and execute commands
   - Claude Code writes state to `~/.claude-deck/state.json`
   - Plugin watches state file for UI updates

3. **Keyboard Simulation** - For interactive session control:
   - AppleScript/xdotool for sending keystrokes
   - Useful for shortcuts like `Shift+Tab`, `Alt+P`

## Actions (Button Types)

### Permission Control

| Action | Icon | Function | Implementation |
|--------|------|----------|----------------|
| **Approve** | ✓ (green) | Accept pending permission | Write to hook file / keystroke |
| **Reject** | ✕ (red) | Deny pending permission | Write to hook file / keystroke |
| **YOLO Mode** | 🔓 | Toggle auto-approve all | CLI flag / toggle state |
| **Plan Mode** | 📋 | Enter read-only planning | CLI flag / `Shift+Tab` |

### Session Control

| Action | Icon | Function | Implementation |
|--------|------|----------|----------------|
| **New Session** | + | Start fresh Claude Code | `claude` command |
| **Continue** | ↩ | Continue last session | `claude -c` |
| **Interrupt** | ⏹ | Cancel current generation | `Ctrl+C` keystroke |
| **Clear** | 🧹 | Clear terminal | `Ctrl+L` keystroke |

### Slash Commands

| Action | Icon | Function | Implementation |
|--------|------|----------|----------------|
| **Commit** | 📝 | Run `/commit` | Send to session |
| **Review** | 👁 | Run `/review` | Send to session |
| **Init** | 🚀 | Run `/init` | Send to session |
| **Doctor** | 🩺 | Run `/doctor` | Send to session |

### Model & Settings

| Action | Icon | Function | Implementation |
|--------|------|----------|----------------|
| **Switch Model** | 🔄 | Cycle Sonnet/Opus | `Alt+P` / CLI flag |
| **Toggle Thinking** | 🧠 | Extended thinking on/off | `Alt+T` keystroke |
| **Toggle Verbose** | 📢 | Verbose output on/off | `Ctrl+O` keystroke |

### Status Display

| Action | Icon | Function | Implementation |
|--------|------|----------|----------------|
| **Status** | Dynamic | Show session state | File watcher |
| **Model Badge** | Dynamic | Show current model | File watcher |
| **Mode Badge** | Dynamic | Show permission mode | File watcher |

## State File Format

`~/.claude-deck/state.json`:
```json
{
  "sessionActive": true,
  "sessionId": "abc123",
  "currentModel": "opus",
  "permissionMode": "default",
  "pendingPermission": {
    "type": "Bash",
    "command": "npm install"
  },
  "status": "waiting_for_input",
  "lastUpdated": "2025-01-10T12:00:00Z"
}
```

## Command File Format

`~/.claude-deck/commands.json`:
```json
{
  "command": "approve",
  "timestamp": "2025-01-10T12:00:01Z"
}
```

## Claude Code Hooks Setup

To enable bidirectional communication, users add hooks to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "*",
        "hooks": [{
          "type": "command",
          "command": "claude-deck-hook permission-request"
        }]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [{
          "type": "command",
          "command": "claude-deck-hook session-stop"
        }]
      }
    ]
  }
}
```

## Button Layouts

### Basic Layout (6-button)
```
┌─────┬─────┬─────┐
│ ✓   │ ✕   │ ⏹  │
│Apprv│Rejct│Stop │
├─────┼─────┼─────┤
│ 🔓  │ 📋  │ 🔄  │
│YOLO │Plan │Model│
└─────┴─────┴─────┘
```

### Full Layout (15-button)
```
┌─────┬─────┬─────┬─────┬─────┐
│ ✓   │ ✕   │ ⏹  │ ↩   │ +   │
│Apprv│Rejct│Stop │Cont │New  │
├─────┼─────┼─────┼─────┼─────┤
│ 🔓  │ 📋  │ 🔄  │ 🧠  │ 📢  │
│YOLO │Plan │Model│Think│Verb │
├─────┼─────┼─────┼─────┼─────┤
│ 📝  │ 👁  │ 🚀  │ 🩺  │ 📊  │
│Commt│Revw │Init │Doctr│Stats│
└─────┴─────┴─────┴─────┴─────┘
```

## Installation

1. Install the Stream Deck plugin (double-click `.streamDeckPlugin`)
2. Run `claude-deck setup` to configure hooks
3. Drag actions to your Stream Deck
4. Start Claude Code and control away!

## Tech Stack

- **Plugin**: Node.js + TypeScript + @elgato/streamdeck
- **IPC**: File-based with fswatch
- **Keystroke**: node-key-sender or AppleScript
- **CLI**: child_process.exec

## MVP Scope

Phase 1 - Core Controls:
- [ ] Approve/Reject buttons
- [ ] YOLO mode toggle
- [ ] Plan mode toggle
- [ ] Interrupt button
- [ ] Model switcher

Phase 2 - Slash Commands:
- [ ] /commit button
- [ ] /review button
- [ ] Custom command buttons

Phase 3 - Status & Polish:
- [ ] Real-time status display
- [ ] Permission request details
- [ ] Icon design
- [ ] Profiles/presets
