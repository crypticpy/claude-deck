#!/usr/bin/env node
/**
 * Claude Deck Hook Handler
 *
 * This Node.js script handles Claude Code hook events and updates
 * the state file for Stream Deck integration.
 *
 * It reads hook data from stdin (JSON) and updates ~/.claude-deck/state.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_DIR = path.join(os.homedir(), '.claude-deck');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

// Ensure state directory exists
if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
}

// Default state
const DEFAULT_STATE = {
    sessionActive: false,
    currentModel: 'sonnet',
    permissionMode: 'default',
    status: 'idle',
    tokens: { input: 0, output: 0 },
    toolCallCount: 0,
    lastTool: null,
    lastUpdated: new Date().toISOString()
};

// Read current state
function readState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const content = fs.readFileSync(STATE_FILE, 'utf-8');
            return { ...DEFAULT_STATE, ...JSON.parse(content) };
        }
    } catch (e) {
        console.error('Error reading state:', e.message);
    }
    return { ...DEFAULT_STATE };
}

// Write state atomically
function writeState(state) {
    state.lastUpdated = new Date().toISOString();
    const tmpFile = STATE_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2));
    fs.renameSync(tmpFile, STATE_FILE);
}

// Parse hook input from environment or stdin
async function getHookInput() {
    // Check for Claude Code hook environment variables
    const hookEvent = process.env.CLAUDE_HOOK_EVENT;
    const hookData = process.env.CLAUDE_HOOK_DATA;

    if (hookEvent) {
        return {
            event: hookEvent,
            data: hookData ? JSON.parse(hookData) : {}
        };
    }

    // Read from stdin
    return new Promise((resolve) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', chunk => { data += chunk; });
        process.stdin.on('end', () => {
            try {
                resolve(JSON.parse(data));
            } catch {
                resolve({ event: process.argv[2] || 'unknown', data: {} });
            }
        });

        // Timeout after 100ms if no stdin
        setTimeout(() => {
            if (!data) {
                resolve({ event: process.argv[2] || 'unknown', data: {} });
            }
        }, 100);
    });
}

// Handle different hook events
function handleEvent(event, data, state) {
    switch (event) {
        case 'SessionStart':
        case 'session-start':
            state.sessionActive = true;
            state.status = 'idle';
            state.tokens = { input: 0, output: 0 };
            state.toolCallCount = 0;
            state.sessionStartTime = new Date().toISOString();
            break;

        case 'Stop':
        case 'session-stop':
            state.status = 'idle';
            // Keep session active until explicit close
            break;

        case 'PreToolUse':
        case 'tool-use':
            state.status = 'working';
            state.lastTool = data.tool || data.toolName || 'unknown';
            state.toolCallCount = (state.toolCallCount || 0) + 1;
            break;

        case 'PostToolUse':
        case 'tool-complete':
            state.lastActivityTime = new Date().toISOString();
            // Keep working status until all tools complete
            break;

        case 'PermissionRequest':
        case 'permission':
            state.status = 'waiting';
            state.pendingPermission = {
                tool: data.tool || data.toolName || 'unknown',
                type: data.type || 'permission',
                description: data.description
            };
            break;

        case 'permission-resolved':
            state.status = 'working';
            delete state.pendingPermission;
            break;

        case 'UserPromptSubmit':
        case 'prompt-submit':
            state.status = 'working';
            break;

        case 'model-change':
            state.currentModel = data.model || 'sonnet';
            break;

        case 'mode-change':
            state.permissionMode = data.mode || 'default';
            break;

        case 'tokens':
            if (data.input !== undefined) state.tokens.input = data.input;
            if (data.output !== undefined) state.tokens.output = data.output;
            break;

        case 'Notification':
            // Could display notifications on Stream Deck
            break;

        default:
            console.error('Unknown event:', event);
    }

    return state;
}

// Main
async function main() {
    try {
        const input = await getHookInput();
        const state = readState();
        const updatedState = handleEvent(input.event, input.data || input, state);
        writeState(updatedState);

        // Output for hook chain (pass through)
        if (input.data) {
            console.log(JSON.stringify(input.data));
        }
    } catch (e) {
        console.error('Hook handler error:', e.message);
        process.exit(1);
    }
}

main();
