#!/bin/bash
#
# Claude Deck Installer
#
# This script:
# 1. Checks prerequisites
# 2. Builds the plugin from source
# 3. Creates the ~/.claude-deck directory
# 4. Installs hook scripts
# 5. Configures Claude Code hooks in settings.json
# 6. Installs the Stream Deck plugin
# 7. Optionally installs context-layer integration
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CLAUDE_DECK_DIR="$HOME/.claude-deck"
CLAUDE_DIR="$HOME/.claude"
HOOKS_DIR="$CLAUDE_DECK_DIR/hooks"
STREAMDECK_PLUGINS_DIR="$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins"
CONTEXT_LAYER_DIR="$HOME/.claude/plugins/context-layer"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "\n${CYAN}${BOLD}▶ $1${NC}"; }

echo ""
echo -e "${BOLD}"
echo "   ╔═══════════════════════════════════════════════════════╗"
echo "   ║                                                       ║"
echo "   ║               🎛️  Claude Deck Installer               ║"
echo "   ║       Stream Deck Controller for Claude Code          ║"
echo "   ║                                                       ║"
echo "   ╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""

# ============================================================================
# Prerequisites Check
# ============================================================================
log_step "Checking prerequisites..."

# Check for Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed"
    echo "       Please install Node.js 20+: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    log_error "Node.js 20+ required (found v$NODE_VERSION)"
    exit 1
fi
log_success "Node.js v$(node -v | cut -d'v' -f2)"

# Check for npm
if ! command -v npm &> /dev/null; then
    log_error "npm is not installed"
    exit 1
fi
log_success "npm v$(npm -v)"

# Check for jq
if ! command -v jq &> /dev/null; then
    log_warn "jq is not installed"
    if command -v brew &> /dev/null; then
        log_info "Installing jq via Homebrew..."
        brew install jq
        log_success "jq installed"
    else
        log_error "Please install jq: brew install jq"
        exit 1
    fi
else
    log_success "jq $(jq --version)"
fi

# Check for Claude Code
if ! command -v claude &> /dev/null; then
    log_warn "Claude Code CLI not found"
    echo "       Install with: npm install -g @anthropic-ai/claude-code"
else
    log_success "Claude Code CLI found"
fi

# Check for Stream Deck
if [ ! -d "$STREAMDECK_PLUGINS_DIR" ]; then
    log_warn "Stream Deck not found at expected location"
    log_info "Will build plugin but skip installation"
fi

# ============================================================================
# Build Plugin
# ============================================================================
log_step "Building Claude Deck plugin..."

cd "$PROJECT_DIR"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    log_info "Installing dependencies..."
    npm install
fi

# Build
log_info "Compiling TypeScript..."
npm run build
log_success "Plugin built successfully"

# ============================================================================
# Create Directories
# ============================================================================
log_step "Setting up Claude Deck directories..."

mkdir -p "$CLAUDE_DECK_DIR"
mkdir -p "$HOOKS_DIR"
mkdir -p "$CLAUDE_DECK_DIR/exports"
mkdir -p "$CLAUDE_DIR"
log_success "Directories created"

# ============================================================================
# Install Hook Scripts
# ============================================================================
log_step "Installing hook scripts..."

cp "$PROJECT_DIR/hooks/hook-handler.js" "$HOOKS_DIR/"
chmod +x "$HOOKS_DIR/hook-handler.js"
log_success "Hook handler installed to $HOOKS_DIR"

# ============================================================================
# Create Initial State
# ============================================================================
log_step "Creating initial state files..."

cat > "$CLAUDE_DECK_DIR/state.json" << 'EOF'
{
  "sessionActive": false,
  "currentModel": "sonnet",
  "permissionMode": "default",
  "status": "idle",
  "tokens": { "input": 0, "output": 0 },
  "toolCallCount": 0,
  "toolUsage": {},
  "sessionCost": 0,
  "contextSize": 200000,
  "contextUsed": 0,
  "contextPercent": 0,
  "sessionStartTime": null,
  "lastUpdated": ""
}
EOF
chmod 600 "$CLAUDE_DECK_DIR/state.json"
log_success "State file created"

# ============================================================================
# Create Default Config
# ============================================================================
if [ ! -f "$CLAUDE_DECK_DIR/config.json" ]; then
    log_info "Creating default config..."

    # Detect terminal
    DETECTED_TERMINAL="kitty"
    if pgrep -x "ghostty" > /dev/null 2>&1; then
        DETECTED_TERMINAL="ghostty"
    elif pgrep -x "kitty" > /dev/null 2>&1; then
        DETECTED_TERMINAL="kitty"
    elif pgrep -x "iTerm2" > /dev/null 2>&1; then
        DETECTED_TERMINAL="iterm"
    fi

    cat > "$CLAUDE_DECK_DIR/config.json" << EOF
{
  "terminal": {
    "type": "$DETECTED_TERMINAL"
  }
}
EOF
    log_success "Config file created (detected: $DETECTED_TERMINAL terminal)"
else
    log_info "Config file already exists, preserving settings"
fi

# ============================================================================
# Configure Claude Code Hooks
# ============================================================================
log_step "Configuring Claude Code hooks..."

SETTINGS_FILE="$CLAUDE_DIR/settings.json"

# Create settings.json if it doesn't exist
if [ ! -f "$SETTINGS_FILE" ]; then
    echo '{}' > "$SETTINGS_FILE"
fi

# Backup existing settings
cp "$SETTINGS_FILE" "$SETTINGS_FILE.backup.$(date +%Y%m%d_%H%M%S)"
log_info "Backed up existing settings"

# Read existing settings
SETTINGS=$(cat "$SETTINGS_FILE")

# Define the hooks configuration
# Claude Code's real hook types: PreToolUse, PostToolUse, Stop, SubagentStop,
# SessionStart, UserPromptSubmit, Notification
# Each hook receives JSON data on stdin which hook-handler.js parses
HOOKS_CONFIG=$(cat << EOF
{
  "PreToolUse": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "node \"$HOOKS_DIR/hook-handler.js\" PreToolUse"
        }
      ]
    }
  ],
  "PostToolUse": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "node \"$HOOKS_DIR/hook-handler.js\" PostToolUse"
        }
      ]
    }
  ],
  "Stop": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "node \"$HOOKS_DIR/hook-handler.js\" Stop"
        }
      ]
    }
  ],
  "SubagentStop": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "node \"$HOOKS_DIR/hook-handler.js\" SubagentStop"
        }
      ]
    }
  ],
  "SessionStart": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "node \"$HOOKS_DIR/hook-handler.js\" SessionStart"
        }
      ]
    }
  ],
  "UserPromptSubmit": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "node \"$HOOKS_DIR/hook-handler.js\" UserPromptSubmit"
        }
      ]
    }
  ],
  "Notification": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "node \"$HOOKS_DIR/hook-handler.js\" Notification"
        }
      ]
    }
  ]
}
EOF
)

# Merge hooks — Claude Deck entries replace existing ones for the same event types.
# User hooks for other event types are preserved.
UPDATED_SETTINGS=$(echo "$SETTINGS" | jq --argjson hooks "$HOOKS_CONFIG" '.hooks = ((.hooks // {}) * $hooks)')
echo "$UPDATED_SETTINGS" | jq '.' > "$SETTINGS_FILE"
log_success "Claude Code hooks configured"

# ============================================================================
# Install Stream Deck Plugin
# ============================================================================
if [ -d "$STREAMDECK_PLUGINS_DIR" ]; then
    log_step "Installing Stream Deck plugin..."

    PLUGIN_SRC="$PROJECT_DIR/com.anthropic.claude-deck.sdPlugin"
    PLUGIN_DST="$STREAMDECK_PLUGINS_DIR/com.anthropic.claude-deck.sdPlugin"

    # Remove old version if exists
    if [ -d "$PLUGIN_DST" ]; then
        rm -rf "$PLUGIN_DST"
        log_info "Removed old plugin version"
    fi

    # Copy new version
    cp -r "$PLUGIN_SRC" "$PLUGIN_DST"
    log_success "Stream Deck plugin installed"
else
    log_step "Skipping Stream Deck plugin installation (not found)"
    log_info "Plugin location: $PROJECT_DIR/com.anthropic.claude-deck.sdPlugin"
fi

# ============================================================================
# Test Hook Installation
# ============================================================================
log_step "Testing hook installation..."

# Test the node hook handler with a synthetic SessionStart event on stdin
echo '{"session_id":"install-test"}' | node "$HOOKS_DIR/hook-handler.js" SessionStart 2>/dev/null || true
STATE=$(cat "$CLAUDE_DECK_DIR/state.json")
if echo "$STATE" | jq -e '.sessionActive == true' > /dev/null 2>&1; then
    log_success "Hook test passed!"
    # Reset state after test
    echo '{}' | node "$HOOKS_DIR/hook-handler.js" Stop 2>/dev/null || true
else
    log_warn "Hook test inconclusive (may work when Claude is running)"
fi

# ============================================================================
# Context-Layer Integration (Optional)
# ============================================================================
echo ""
echo -e "${CYAN}${BOLD}▶ Context-Layer Integration (Optional)${NC}"
echo ""

if [ -d "$CONTEXT_LAYER_DIR" ]; then
    log_success "context-layer already installed at $CONTEXT_LAYER_DIR"
else
    echo "   context-layer provides AI memory and learning features:"
    echo "   - Brain Search: Search lessons and insights"
    echo "   - Mistake Log: Record and avoid past mistakes"
    echo ""
    read -p "   Install context-layer? [y/N] " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Installing context-layer..."

        mkdir -p "$HOME/.claude/plugins"

        if command -v git &> /dev/null; then
            git clone https://github.com/anthropics/context-layer.git "$CONTEXT_LAYER_DIR" 2>/dev/null || {
                log_warn "Could not clone context-layer (repo may not exist yet)"
                log_info "You can install manually later from: https://github.com/anthropics/context-layer"
            }

            if [ -d "$CONTEXT_LAYER_DIR" ]; then
                cd "$CONTEXT_LAYER_DIR"
                npm install && npm run build

                # Add to MCP servers
                SETTINGS=$(cat "$SETTINGS_FILE")
                MCP_CONFIG=$(cat << EOF
{
  "context-layer": {
    "type": "stdio",
    "command": "node",
    "args": ["$CONTEXT_LAYER_DIR/dist/mcp-server.js"]
  }
}
EOF
)
                UPDATED_SETTINGS=$(echo "$SETTINGS" | jq --argjson mcp "$MCP_CONFIG" '.mcpServers = ($mcp * (.mcpServers // {}))')
                echo "$UPDATED_SETTINGS" | jq '.' > "$SETTINGS_FILE"

                log_success "context-layer installed and configured"
            fi
        else
            log_warn "git not found, skipping context-layer installation"
        fi
    else
        log_info "Skipping context-layer (can install later)"
    fi
fi

# ============================================================================
# Completion
# ============================================================================
echo ""
echo -e "${GREEN}${BOLD}"
echo "   ╔═══════════════════════════════════════════════════════╗"
echo "   ║                                                       ║"
echo "   ║            ✅ Installation Complete!                  ║"
echo "   ║                                                       ║"
echo "   ╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo "   ${BOLD}Next steps:${NC}"
echo ""
echo "   1. Restart Stream Deck application"
echo "   2. Look for 'Claude Code' category in Stream Deck"
echo "   3. Drag actions onto your Stream Deck"
echo "   4. Start a Claude Code session"
echo ""
echo "   ${BOLD}Configuration files:${NC}"
echo ""
echo "   • State:    $CLAUDE_DECK_DIR/state.json"
echo "   • Config:   $CLAUDE_DECK_DIR/config.json"
echo "   • Hooks:    $CLAUDE_DIR/settings.json"
echo ""
echo "   ${BOLD}To change terminal:${NC}"
echo ""
echo "   Edit $CLAUDE_DECK_DIR/config.json"
echo "   Options: kitty, ghostty, iterm, terminal, wezterm, alacritty"
echo ""
echo "   ${BOLD}Need help?${NC}"
echo ""
echo "   • GitHub: https://github.com/anthropics/claude-deck"
echo "   • Issues: https://github.com/anthropics/claude-deck/issues"
echo ""
