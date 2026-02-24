#!/usr/bin/env node
/**
 * Claude Deck Hook Handler
 *
 * Handles Claude Code hook events and updates the state file
 * for Stream Deck integration.
 *
 * Invocation:
 *   node hook-handler.js <HookType>
 *
 * where HookType is one of:
 *   PreToolUse, PostToolUse, Notification, Stop, SubagentStop,
 *   SessionStart, UserPromptSubmit
 *
 * Claude Code pipes JSON on stdin. The hook type is NOT in the JSON —
 * it comes from argv[2]. The JSON payload varies by hook type:
 *
 *   PreToolUse:       { "tool_name": "...", "tool_input": {...} }
 *   PostToolUse:      { "tool_name": "...", "tool_input": {...}, "tool_output": "..." }
 *   Notification:     { "message": "..." }
 *   Stop:             { "stop_reason": "...", "session_id": "..." }
 *   SubagentStop:     { "stop_reason": "...", "session_id": "..." }
 *   SessionStart:     { "session_id": "..." }
 *   UserPromptSubmit: { "prompt": "..." }
 *
 * For PreToolUse hooks, stdout must be valid JSON (we output {}).
 * Other hook types should not produce stdout output.
 */

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const STATE_DIR = path.join(os.homedir(), ".claude-deck");
const STATE_FILE = path.join(STATE_DIR, "state.json");
const STATE_PERMS = 0o600;

// Safety timeout — if stdin never closes, exit after 5 seconds
const STDIN_TIMEOUT_MS = 5000;

// Ensure state directory exists
if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

// Default state shape
const DEFAULT_STATE = {
  sessionActive: false,
  currentModel: "sonnet",
  permissionMode: "default",
  status: "idle",
  tokens: { input: 0, output: 0 },
  toolCallCount: 0,
  toolUsage: {},
  lastTool: null,
  sessionCost: 0,
  contextSize: 200000,
  contextUsed: 0,
  contextPercent: 0,
  sessionStartTime: null,
  lastActivityTime: null,
  lastUpdated: new Date().toISOString(),
};

/**
 * Read state from disk, merging with defaults for any missing keys.
 */
function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const content = fs.readFileSync(STATE_FILE, "utf-8");
      return { ...DEFAULT_STATE, ...JSON.parse(content) };
    }
  } catch (e) {
    // If state file is corrupt, start fresh
    process.stderr.write(`[claude-deck] Error reading state: ${e.message}\n`);
  }
  return { ...DEFAULT_STATE };
}

/**
 * Write state atomically: write to a .tmp file, then rename.
 * Sets file permissions to 0o600.
 */
function writeState(state) {
  state.lastUpdated = new Date().toISOString();
  const tmpFile = `${STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), {
      mode: STATE_PERMS,
    });
    fs.renameSync(tmpFile, STATE_FILE);
    // Ensure final file has correct permissions (rename preserves tmp perms)
    try {
      fs.chmodSync(STATE_FILE, STATE_PERMS);
    } catch (_) {
      /* best effort */
    }
  } catch (e) {
    // Clean up tmp file on failure
    try {
      fs.unlinkSync(tmpFile);
    } catch (_) {
      /* ignore */
    }
    throw e;
  }
}

/**
 * Read all of stdin until EOF. Returns a Promise<string>.
 * Has a safety timeout in case stdin never closes.
 */
function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    let resolved = false;

    const finish = (result) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(result);
      }
    };

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => finish(data));
    process.stdin.on("error", () => finish(data));

    // Safety net: if stdin never closes, resolve with what we have after timeout
    const timer = setTimeout(() => {
      finish(data);
    }, STDIN_TIMEOUT_MS);

    // Start reading
    process.stdin.resume();
  });
}

/**
 * Parse JSON from stdin data. Returns parsed object or empty object on failure.
 */
function parseInput(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    process.stderr.write(
      `[claude-deck] Failed to parse stdin JSON: ${e.message}\n`,
    );
    return {};
  }
}

/**
 * Handle hook event and mutate state accordingly.
 *
 * @param {string} hookType - The hook type from argv[2]
 * @param {object} data - Parsed JSON from stdin
 * @param {object} state - Current state object (mutated in place)
 * @returns {object} The updated state
 */
function handleEvent(hookType, data, state) {
  // Ensure sub-objects exist
  if (!state.tokens) state.tokens = { input: 0, output: 0 };
  if (!state.toolUsage) state.toolUsage = {};

  const now = new Date().toISOString();

  switch (hookType) {
    case "SessionStart": {
      state.sessionActive = true;
      state.status = "idle";
      state.tokens = { input: 0, output: 0 };
      state.toolCallCount = 0;
      state.toolUsage = {};
      state.lastTool = null;
      state.sessionStartTime = now;
      state.pendingPermission = null;
      if (data.session_id) {
        state.sessionId = data.session_id;
      }
      break;
    }

    case "PreToolUse": {
      const toolName = data.tool_name || "unknown";
      state.status = "working";
      state.lastTool = toolName;
      state.toolCallCount = (state.toolCallCount || 0) + 1;
      state.toolUsage[toolName] = (state.toolUsage[toolName] || 0) + 1;
      state.lastActivityTime = now;
      break;
    }

    case "PostToolUse": {
      // Keep status=working (don't flicker to idle between tool calls)
      state.lastActivityTime = now;
      break;
    }

    case "Stop": {
      state.status = "idle";
      state.sessionActive = false;
      state.pendingPermission = null;
      state.lastActivityTime = now;
      break;
    }

    case "SubagentStop": {
      // Subagent finished — just record activity, don't change main status
      state.lastActivityTime = now;
      break;
    }

    case "UserPromptSubmit": {
      state.status = "working";
      state.lastActivityTime = now;
      break;
    }

    case "Notification": {
      // No state change needed for notifications.
      // Could be extended to show notifications on Stream Deck in the future.
      break;
    }

    default: {
      process.stderr.write(`[claude-deck] Unknown hook type: ${hookType}\n`);
      break;
    }
  }

  return state;
}

/**
 * Main entry point.
 */
async function main() {
  const hookType = process.argv[2];

  if (!hookType) {
    process.stderr.write("[claude-deck] Usage: hook-handler.js <HookType>\n");
    process.exit(1);
  }

  try {
    // Read all stdin
    const raw = await readStdin();
    const data = parseInput(raw);

    // Read current state, apply event, write back
    const state = readState();
    handleEvent(hookType, data, state);
    writeState(state);

    // For PreToolUse, Claude Code expects valid JSON on stdout.
    // Output an empty object so we don't interfere with the hook protocol.
    if (hookType === "PreToolUse") {
      process.stdout.write("{}");
    }
    // For all other hook types, output nothing to stdout.
  } catch (e) {
    process.stderr.write(`[claude-deck] Hook handler error: ${e.message}\n`);
    process.exit(1);
  }
}

main();
