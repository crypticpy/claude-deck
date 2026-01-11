#!/bin/bash
#
# Claude Deck Uninstaller
#
# Removes Claude Deck hooks and optionally the Stream Deck plugin
#

set -e

CLAUDE_DECK_DIR="$HOME/.claude-deck"
CLAUDE_DIR="$HOME/.claude"
STREAMDECK_PLUGINS_DIR="$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins"
PLUGIN_DIR="$STREAMDECK_PLUGINS_DIR/com.anthropic.claude-deck.sdPlugin"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║        Claude Deck Uninstaller            ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Confirm
read -p "This will remove Claude Deck hooks and plugin. Continue? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

# Remove hooks from Claude Code settings
log_info "Removing hooks from Claude Code settings..."
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
if [ -f "$SETTINGS_FILE" ]; then
    if command -v jq &> /dev/null; then
        # Remove claude-deck hooks
        SETTINGS=$(cat "$SETTINGS_FILE")
        UPDATED=$(echo "$SETTINGS" | jq 'del(.hooks.UserPromptSubmit[] | select(.hooks[].command | contains("claude-deck")))' 2>/dev/null || echo "$SETTINGS")
        UPDATED=$(echo "$UPDATED" | jq 'del(.hooks.PreToolUse[] | select(.hooks[].command | contains("claude-deck")))' 2>/dev/null || echo "$UPDATED")
        UPDATED=$(echo "$UPDATED" | jq 'del(.hooks.PostToolUse[] | select(.hooks[].command | contains("claude-deck")))' 2>/dev/null || echo "$UPDATED")
        UPDATED=$(echo "$UPDATED" | jq 'del(.hooks.PermissionRequest[] | select(.hooks[].command | contains("claude-deck")))' 2>/dev/null || echo "$UPDATED")
        UPDATED=$(echo "$UPDATED" | jq 'del(.hooks.Stop[] | select(.hooks[].command | contains("claude-deck")))' 2>/dev/null || echo "$UPDATED")
        echo "$UPDATED" > "$SETTINGS_FILE"
        log_success "Hooks removed from settings"
    else
        log_warn "jq not found, please manually edit $SETTINGS_FILE"
    fi
fi

# Remove Stream Deck plugin
if [ -d "$PLUGIN_DIR" ]; then
    log_info "Removing Stream Deck plugin..."
    rm -rf "$PLUGIN_DIR"
    log_success "Plugin removed"
fi

# Ask about removing config/state
read -p "Remove Claude Deck config and state files? [y/N] " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -d "$CLAUDE_DECK_DIR" ]; then
        rm -rf "$CLAUDE_DECK_DIR"
        log_success "Removed $CLAUDE_DECK_DIR"
    fi
fi

echo ""
log_success "Uninstallation complete!"
echo ""
log_warn "Please restart Stream Deck to complete removal"
echo ""
