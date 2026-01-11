#!/bin/bash
#
# Test script for Claude Deck hooks
#
# Simulates a Claude Code session to test the hook integration
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SCRIPT="$SCRIPT_DIR/../hooks/claude-deck-hook.sh"
STATE_FILE="$HOME/.claude-deck/state.json"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[TEST]${NC} $1"; }
show_state() {
    echo -e "${YELLOW}State:${NC}"
    cat "$STATE_FILE" | jq -C '.'
    echo ""
}

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║       Claude Deck Hook Test Suite         ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Ensure hook script exists
if [ ! -f "$HOOK_SCRIPT" ]; then
    echo "Hook script not found at $HOOK_SCRIPT"
    echo "Run install.sh first"
    exit 1
fi

# Test 1: Session Start
log "Simulating session start..."
"$HOOK_SCRIPT" session-start
show_state
sleep 0.5

# Test 2: User prompt
log "Simulating user prompt submission..."
"$HOOK_SCRIPT" prompt-submit
show_state
sleep 0.5

# Test 3: Tool use
log "Simulating tool use (Read)..."
"$HOOK_SCRIPT" tool-use "Read"
show_state
sleep 0.5

# Test 4: Tool complete
log "Simulating tool completion..."
"$HOOK_SCRIPT" tool-complete
show_state
sleep 0.5

# Test 5: Another tool
log "Simulating tool use (Edit)..."
"$HOOK_SCRIPT" tool-use "Edit"
show_state
sleep 0.5

# Test 6: Permission request
log "Simulating permission request (Bash)..."
"$HOOK_SCRIPT" permission "Bash"
show_state
sleep 0.5

# Test 7: Permission resolved
log "Simulating permission granted..."
"$HOOK_SCRIPT" permission-resolved
show_state
sleep 0.5

# Test 8: Model change
log "Simulating model change to Opus..."
"$HOOK_SCRIPT" model-change "opus"
show_state
sleep 0.5

# Test 9: Token update
log "Simulating token update..."
"$HOOK_SCRIPT" tokens 15234 8421
show_state
sleep 0.5

# Test 10: Session stop
log "Simulating session stop..."
"$HOOK_SCRIPT" session-stop
show_state

echo ""
echo -e "${GREEN}All tests completed!${NC}"
echo ""
echo "Watch the state file in real-time with:"
echo "  watch -n 0.5 'cat ~/.claude-deck/state.json | jq'"
echo ""
