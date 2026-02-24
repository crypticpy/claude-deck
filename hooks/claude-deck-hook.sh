#!/bin/bash
#
# Claude Deck Hook - Updates state for Stream Deck integration
#
# This script is called by Claude Code hooks to update the state file
# that the Stream Deck plugin reads from.
#
# Usage: claude-deck-hook.sh <event> [args...]
#
# Events:
#   session-start    - New session started
#   session-stop     - Session ended
#   tool-use         - Tool was called
#   permission       - Permission requested
#   prompt-submit    - User submitted prompt
#   model-change     - Model changed
#

set -e

# Configuration
STATE_DIR="$HOME/.claude-deck"
STATE_FILE="$STATE_DIR/state.json"
COMMANDS_FILE="$STATE_DIR/commands.json"

# Ensure state directory exists
mkdir -p "$STATE_DIR"

# Initialize state file if it doesn't exist
if [ ! -f "$STATE_FILE" ]; then
    cat > "$STATE_FILE" << 'EOF'
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
  "lastUpdated": ""
}
EOF
fi

# Read current state
read_state() {
    cat "$STATE_FILE"
}

# Write state atomically
write_state() {
    local tmp_file="$STATE_FILE.tmp"
    echo "$1" > "$tmp_file"
    mv "$tmp_file" "$STATE_FILE"
}

# Update a single field in state
update_field() {
    local field="$1"
    local value="$2"
    local state
    state=$(read_state)

    # Use jq if available, otherwise use sed for simple updates
    if command -v jq &> /dev/null; then
        state=$(echo "$state" | jq --arg v "$value" ".$field = \$v")
    else
        # Fallback: simple sed replacement for string values
        state=$(echo "$state" | sed "s/\"$field\": \"[^\"]*\"/\"$field\": \"$value\"/")
    fi

    # Always update lastUpdated
    local now
    now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    if command -v jq &> /dev/null; then
        state=$(echo "$state" | jq --arg t "$now" '.lastUpdated = $t')
    else
        state=$(echo "$state" | sed "s/\"lastUpdated\": \"[^\"]*\"/\"lastUpdated\": \"$now\"/")
    fi

    write_state "$state"
}

# Update numeric field
update_numeric() {
    local field="$1"
    local value="$2"
    local state
    state=$(read_state)

    if command -v jq &> /dev/null; then
        state=$(echo "$state" | jq ".$field = $value")
        local now
        now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        state=$(echo "$state" | jq --arg t "$now" '.lastUpdated = $t')
    fi

    write_state "$state"
}

# Increment tool call count
increment_tool_count() {
    local state
    state=$(read_state)

    if command -v jq &> /dev/null; then
        state=$(echo "$state" | jq '.toolCallCount = (.toolCallCount // 0) + 1')
        local now
        now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        state=$(echo "$state" | jq --arg t "$now" '.lastUpdated = $t')
        write_state "$state"
    fi
}

# Update tokens
update_tokens() {
    local input="$1"
    local output="$2"
    local state
    state=$(read_state)

    if command -v jq &> /dev/null; then
        state=$(echo "$state" | jq ".tokens.input = $input | .tokens.output = $output")
        local now
        now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        state=$(echo "$state" | jq --arg t "$now" '.lastUpdated = $t')
        write_state "$state"
    fi
}

# Main event handler
EVENT="$1"
shift || true

case "$EVENT" in
    session-start)
        if command -v jq &> /dev/null; then
            state=$(read_state)
            now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
            state=$(echo "$state" | jq --arg t "$now" '
                .sessionActive = true |
                .status = "idle" |
                .permissionMode = "default" |
                .tokens = { input: 0, output: 0 } |
                .toolCallCount = 0 |
                .toolUsage = {} |
                .sessionStartTime = $t |
                .lastUpdated = $t
            ')
            write_state "$state"
        else
            update_field "sessionActive" "true"
            update_field "status" "idle"
            update_field "permissionMode" "default"
        fi
        ;;

    session-stop)
        update_field "sessionActive" "false"
        update_field "status" "idle"
        ;;

    tool-use)
        TOOL_NAME="${1:-unknown}"
        if command -v jq &> /dev/null; then
            state=$(read_state)
            now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
            state=$(echo "$state" | jq --arg tool "$TOOL_NAME" --arg t "$now" '
                .status = "working" |
                .lastTool = $tool |
                .toolCallCount = (.toolCallCount // 0) + 1 |
                .toolUsage = (.toolUsage // {}) |
                .toolUsage[$tool] = ((.toolUsage[$tool] // 0) + 1) |
                .lastUpdated = $t
            ')
            write_state "$state"
        else
            update_field "status" "working"
            update_field "lastTool" "$TOOL_NAME"
            increment_tool_count
        fi
        ;;

    tool-complete)
        update_field "status" "idle"
        update_field "lastActivityTime" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        ;;

    permission)
        TOOL_NAME="${1:-unknown}"
        update_field "status" "waiting"

        if command -v jq &> /dev/null; then
            state=$(read_state)
            now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
            state=$(echo "$state" | jq --arg tool "$TOOL_NAME" --arg t "$now" '
                .pendingPermission = { tool: $tool, type: "permission", requestedAt: $t } |
                .lastUpdated = $t
            ')
            write_state "$state"
        fi
        ;;

    permission-resolved)
        update_field "status" "working"

        if command -v jq &> /dev/null; then
            state=$(read_state)
            now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
            state=$(echo "$state" | jq --arg t "$now" '
                del(.pendingPermission) |
                .lastUpdated = $t
            ')
            write_state "$state"
        fi
        ;;

    prompt-submit)
        update_field "status" "working"
        ;;

    model-change)
        MODEL="${1:-sonnet}"
        update_field "currentModel" "$MODEL"
        ;;

    mode-change)
        MODE="${1:-default}"
        update_field "permissionMode" "$MODE"
        ;;

    tokens)
        INPUT="${1:-0}"
        OUTPUT="${2:-0}"
        update_tokens "$INPUT" "$OUTPUT"
        ;;

    context)
        # context <size> <used> <percent> <cost>
        SIZE="${1:-0}"
        USED="${2:-0}"
        PCT="${3:-0}"
        COST="${4:-0}"
        if command -v jq &> /dev/null; then
            state=$(read_state)
            now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
            state=$(echo "$state" | jq --arg t "$now" --argjson size "$SIZE" --argjson used "$USED" --argjson pct "$PCT" --argjson cost "$COST" '
                .contextSize = $size |
                .contextUsed = $used |
                .contextPercent = $pct |
                .sessionCost = $cost |
                .lastUpdated = $t
            ')
            write_state "$state"
        fi
        ;;

    status)
        STATUS="${1:-idle}"
        update_field "status" "$STATUS"
        ;;

    *)
        echo "Unknown event: $EVENT" >&2
        exit 1
        ;;
esac

exit 0
