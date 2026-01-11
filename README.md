# Claude Deck

Stream Deck plugin to control Claude Code CLI with tactile button presses. Turn your Stream Deck into a mission control for AI-assisted coding.

![Claude Deck](docs/hero.png)

## Features

### Control Actions
| Action | Description |
|--------|-------------|
| **Approve** | Accept pending permission requests |
| **Reject** | Decline pending permission requests |
| **Interrupt** | Stop current operation (Ctrl+C) |
| **YOLO Mode** | Toggle auto-approve mode |
| **Plan Mode** | Toggle read-only planning mode |
| **Switch Model** | Cycle between Sonnet and Opus |
| **New Session** | Start a fresh Claude Code session |
| **Continue** | Resume the most recent session |
| **Toggle Thinking** | Enable/disable extended thinking |

### Display Actions
| Action | Description |
|--------|-------------|
| **Status Display** | Shows current session status (idle/working/waiting) |
| **Token Counter** | Input/output token usage |
| **Cost Tracker** | Estimated API cost for session |
| **Context Bar** | Visual progress bar of context window usage |
| **Context %** | Circular gauge showing context percentage |
| **Session Timer** | How long the current session has been running |
| **Model Badge** | Current model with tap-to-switch |
| **Mode Badge** | Current permission mode |
| **Activity Monitor** | Live tool calls and activity |
| **Tool Breakdown** | Pie chart of tool usage distribution |
| **Git Status** | Current branch and changes |

### Fun Actions
| Action | Description |
|--------|-------------|
| **Claude Mood** | Animated face showing Claude's state |
| **Idle Detector** | Pulsing indicator when Claude awaits input |
| **Matrix Rain** | Animated matrix effect when working |

### Utility Actions
| Action | Description |
|--------|-------------|
| **Commit** | Run /commit command |
| **Review** | Run /review command |
| **Slash Command** | Configurable - run any slash command |
| **Prompt Preset** | Configurable saved prompts |
| **Clipboard to Claude** | Send clipboard contents to Claude |
| **Screenshot to Claude** | Capture and analyze screenshots |
| **Export Session** | Save transcript to file |

### Context-Layer Integration (Optional)
| Action | Description |
|--------|-------------|
| **Brain Search** | Search context-layer brain for insights |
| **Log Mistake** | Record mistakes for future learning |

## Quick Start

```bash
# Clone the repo
git clone https://github.com/anthropics/claude-deck.git
cd claude-deck

# Run the installer
./scripts/install.sh
```

The installer will:
1. Build the plugin
2. Install hooks into Claude Code
3. Install the Stream Deck plugin
4. Configure your terminal

## Requirements

- **macOS 13+** (Windows support planned)
- **Stream Deck software v6.6+**
- **Node.js 20+**
- **Claude Code CLI** (`npm install -g @anthropic-ai/claude-code`)
- **jq** (installed automatically via Homebrew if missing)

## Terminal Support

Claude Deck supports multiple terminal emulators:

| Terminal | Config Value | Notes |
|----------|--------------|-------|
| Kitty | `kitty` | Default, uses `--single-instance` |
| Ghostty | `ghostty` | Full support |
| iTerm2 | `iterm` | AppleScript integration |
| Terminal.app | `terminal` | macOS default |
| WezTerm | `wezterm` | Full support |
| Alacritty | `alacritty` | Full support |

### Configure Terminal

Edit `~/.claude-deck/config.json`:

```json
{
  "terminal": {
    "type": "ghostty"
  }
}
```

## How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Stream Deck   │────▶│   Claude Deck    │────▶│   Claude Code   │
│   (Hardware)    │     │   (Plugin)       │     │   (Terminal)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │    ▲
                               ▼    │
                        ┌──────────────────┐
                        │  ~/.claude-deck  │
                        │   state.json     │
                        └──────────────────┘
                               ▲
                               │
                        ┌──────────────────┐
                        │  Claude Hooks    │
                        │  (statusline)    │
                        └──────────────────┘
```

1. **Hooks** - Claude Code hooks update `~/.claude-deck/state.json` on every event
2. **Plugin** - Stream Deck plugin polls state and updates button displays
3. **Actions** - Button presses send keystrokes to the terminal via AppleScript

### Key Files

| File | Purpose |
|------|---------|
| `~/.claude-deck/state.json` | Real-time session state |
| `~/.claude-deck/config.json` | Terminal and plugin settings |
| `~/.claude/settings.json` | Claude Code hooks configuration |

## Context-Layer Integration

Claude Deck can integrate with [context-layer](https://github.com/anthropics/context-layer), an intelligent context management system for Claude Code.

### Install Context-Layer

```bash
# Clone context-layer
git clone https://github.com/anthropics/context-layer.git ~/.claude/plugins/context-layer
cd ~/.claude/plugins/context-layer
npm install && npm run build

# Add to Claude Code MCP servers (in ~/.claude/settings.json)
{
  "mcpServers": {
    "context-layer": {
      "type": "stdio",
      "command": "node",
      "args": ["~/.claude/plugins/context-layer/dist/mcp-server.js"]
    }
  }
}
```

### Available Tools

Once installed, these Stream Deck actions connect to context-layer:

- **Brain Search** - Searches the project brain for lessons, patterns, and insights
- **Log Mistake** - Records mistakes to help Claude avoid repeating them

## Button Layouts

### Minimal (6-button)
```
┌─────┬─────┬─────┐
│  ✓  │  ✕  │  ⏹  │
│Apprv│Rejct│Stop │
├─────┼─────┼─────┤
│ 🔓  │ 📊  │ 🔄  │
│YOLO │Stats│Model│
└─────┴─────┴─────┘
```

### Standard (15-button)
```
┌─────┬─────┬─────┬─────┬─────┐
│  ✓  │  ✕  │  ⏹  │  ↩  │  +  │
│Apprv│Rejct│Stop │Cont │ New │
├─────┼─────┼─────┼─────┼─────┤
│ 🔓  │ 📋  │ 🔄  │ 🧠  │ 💰  │
│YOLO │Plan │Model│Think│Cost │
├─────┼─────┼─────┼─────┼─────┤
│ ▓▓▓ │ 42% │ ⏱️  │ 😊  │ 🔧  │
│CtxBr│Ctx% │Timer│Mood │Tools│
└─────┴─────┴─────┴─────┴─────┘
```

### Pro (32-button Stream Deck XL)
```
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│  ✓  │  ✕  │  ⏹  │  ↩  │  +  │ 🔓  │ 📋  │ 🔄  │
│Apprv│Rejct│Stop │Cont │ New │YOLO │Plan │Model│
├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│ 🧠  │ 💰  │ 📊  │ ▓▓▓ │ 42% │ ⏱️  │ 😊  │ 🌧️  │
│Think│Cost │Token│CtxBr│Ctx% │Timer│Mood │Matx │
├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│ 📝  │ 🔍  │ 📋  │ 📸  │ 💾  │ 🎯  │ 🧠  │ ⚠️  │
│Commt│Revew│Clip │Shot │Exprt│Slash│Brain│Mstke│
├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤
│ P1  │ P2  │ P3  │ P4  │ Git │ ═══ │ ═══ │ ═══ │
│Prst1│Prst2│Prst3│Prst4│Stats│ --- │ --- │ --- │
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
```

## Development

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Watch mode for development
npm run watch

# Type check
npm run typecheck

# Lint
npm run lint
```

### Project Structure

```
claude-deck/
├── src/
│   ├── actions/          # Stream Deck action implementations
│   ├── utils/            # Shared utilities (claude-controller, etc.)
│   └── plugin.ts         # Main plugin entry point
├── com.anthropic.claude-deck.sdPlugin/
│   ├── bin/              # Compiled plugin
│   ├── imgs/             # Action icons
│   ├── ui/               # Property inspectors
│   └── manifest.json     # Plugin manifest
├── hooks/                # Claude Code hook scripts
└── scripts/              # Install/uninstall scripts
```

### Adding New Actions

1. Create action file in `src/actions/`
2. Add icon SVG to `com.anthropic.claude-deck.sdPlugin/imgs/actions/`
3. Register in `src/plugin.ts`
4. Add manifest entry in `manifest.json`
5. Build and test

## Accessibility

On macOS, grant accessibility permissions for AppleScript:

1. **System Settings → Privacy & Security → Accessibility**
2. Add **Stream Deck** to allowed apps
3. Add your terminal app if keystrokes don't work

## Troubleshooting

### Keystrokes not working
- Check accessibility permissions
- Ensure terminal window is focused
- Verify terminal config in `~/.claude-deck/config.json`

### State not updating
- Restart Claude Code to pick up new hooks
- Check `~/.claude-deck/state.json` is being written
- Run `./scripts/test-hooks.sh` to verify hooks

### Plugin not loading
- Restart Stream Deck application
- Check logs: `~/Library/Logs/ElgatoStreamDeck/StreamDeck.log`
- Verify Node.js 20+ is installed

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Run `npm run lint && npm run typecheck`
5. Submit a PR

## License

MIT License - see [LICENSE](LICENSE)

## Credits

Built with:
- [Elgato Stream Deck SDK](https://developer.elgato.com/documentation/)
- [Claude Code](https://claude.ai/code)
- [context-layer](https://github.com/anthropics/context-layer) (optional)

---

Made with love for the Claude Code community
