# Dashboard Layout Guide

The Dashboard layout is designed for users who run multiple AI coding agents simultaneously and want dedicated controls for each.

## Layout Overview

```
Stream Deck XL (32 buttons) - Dashboard Mode
+--------+--------+--------+--------+--------+--------+--------+--------+
| CLAUDE | Claude | Claude | Claude | CODEX  | Codex  | Codex  | Codex  |
| STATUS | Approve| Reject |  Stop  | STATUS | Approve| Reject |  Stop  |
+--------+--------+--------+--------+--------+--------+--------+--------+
| Cost   | Ctx %  | /commit| Details| Cost   | Ctx %  | Command| Details|
| $0.42  |  65%   |        |   ->   | Free   |   --   |        |   ->   |
+--------+--------+--------+--------+--------+--------+--------+--------+
| GEMINI | Gemini | Gemini | Gemini | AIDER  | Aider  | Aider  | Aider  |
| STATUS | Approve| Reject |  Stop  | STATUS | Approve| Reject |  Stop  |
+--------+--------+--------+--------+--------+--------+--------+--------+
| Cost   | Ctx %  | Command| Details| Cost   | Ctx %  | /commit| Details|
| $0.08  |  22%   |        |   ->   | $0.15  |  40%   |        |   ->   |
+--------+--------+--------+--------+--------+--------+--------+--------+
```

## Setting Up Dashboard Mode

### 1. Add Agent Badge Buttons (Status)

For each agent you want to monitor, add an **Agent Badge** action:

1. Drag "Agent Badge" to a button
2. In Property Inspector, select the agent (Claude, Codex, Gemini, Aider, OpenCode)
3. The badge shows:
   - Filled circle when active/focused
   - Status color (green=working, yellow=waiting, red=error)
   - Agent initials and color

### 2. Add Agent-Specific Control Buttons

For Approve, Reject, and Interrupt buttons that always target a specific agent:

1. Drag the action (Approve/Reject/Interrupt) to a button
2. Open Property Inspector
3. Select "Target Agent" from the dropdown
4. Choose the specific agent (e.g., "Claude Code")

When a target agent is selected:
- Button shows agent name and color
- Commands always go to that agent, regardless of focus
- Visual indicator shows which agent the button controls

### 3. Display Actions

Display actions can also be configured to show specific agent data:

- **Cost Display** - Shows session cost for active/targeted agent
- **Context %** - Shows context window usage
- **Token Display** - Shows token usage
- **Activity Display** - Shows working/idle/waiting status

## Example: 4-Agent Dashboard

For a setup monitoring Claude, Codex, Gemini, and Aider:

**Row 1 (Claude quadrant):**
- Agent Badge: claude
- Approve: targetAgent=claude
- Reject: targetAgent=claude
- Interrupt: targetAgent=claude

**Row 1 (Codex quadrant):**
- Agent Badge: codex
- Approve: targetAgent=codex
- Reject: targetAgent=codex
- Interrupt: targetAgent=codex

**Row 2 (Claude stats):**
- Cost Display: targetAgent=claude
- Context %: targetAgent=claude
- Slash Command: /commit, targetAgent=claude
- (Navigation button)

...and so on for Gemini and Aider quadrants.

## Tips

1. **Color coding**: Each agent has a distinct color that appears on buttons
   - Claude: Purple (#AF52DE)
   - Codex: Green (#00C853)
   - Gemini: Blue (#4285F4)
   - Aider: Amber (#FFC107)
   - OpenCode: Orange (#FF9800)

2. **Quick switching**: Press any Agent Badge to make that agent active

3. **Long press**: Long-press an Agent Badge to spawn a new session

4. **Visual feedback**: Buttons pulse when their agent becomes active

## Comparison: Default vs Dashboard Mode

| Feature | Default Mode | Dashboard Mode |
|---------|--------------|----------------|
| Button target | Active agent (follows focus) | Specific agent (fixed) |
| Use case | One agent at a time | Multiple agents in parallel |
| Visual feedback | Updates based on focus | Each button shows its target |
| Layout | Universal controls | Dedicated per-agent sections |
