# Implementation Plan: Claude Deck Feature Expansion

Created: 2026-01-10
Status: PENDING APPROVAL

## Summary
Expand Claude Deck with ~15 new features across smart displays, advanced controls, notifications, utilities, and visual enhancements. Features will leverage existing hook infrastructure and context-layer MCP integration.

## Current State (Already Implemented)
- ✅ Session Timer, Git Status, Slash Command, Context Bar/%, Brain Search, Mistake Log
- ✅ 22 action files, hooks working, state sync functional

## Scope

### In Scope (Prioritized by Feasibility)

**Tier 1 - High Impact, Easy Implementation:**
1. Compaction Alert - Enhance context-bar to pulse when >80%
2. Quick Notes - Send typed text via Stream Deck
3. Idle Detector - Show when Claude awaits input
4. Error Flash - Pulse button on errors
5. Clipboard to Claude - Paste clipboard as prompt
6. Tool Breakdown - Pie chart of tool usage

**Tier 2 - Medium Complexity:**
7. Custom Prompt Presets - Configurable saved prompts
8. Sound FX Toggle - Audio notifications
9. Claude Mood - Animated face based on state
10. Session Export - One-tap transcript backup

**Tier 3 - Complex/Research Needed:**
11. Speed Meter - Tokens/second (requires API timing data)
12. Achievement Badges - Milestone tracking
13. MCP Server Panel - Show connected servers
14. Project Switcher - Quick directory changes

### Out of Scope (This Phase)
- Multi-Session Switcher (requires process management)
- Tool Approval Filters (requires hook modification)
- Rate Limit Gauge (no API access to quota)
- Screenshot to Claude (complex image handling)
- Undo Last (requires file change tracking)
- Matrix Rain (low priority visual)

## Parallel Execution Strategy

### Workstream Analysis
| Workstream | Files Owned | Dependencies |
|------------|-------------|--------------|
| Display Actions | compaction-alert.ts, tool-breakdown.ts, speed-meter.ts | State updates from hooks |
| Control Actions | quick-notes.ts, prompt-preset.ts, clipboard-send.ts | claudeController.sendText() |
| Alert Actions | error-flash.ts, idle-detector.ts, sound-fx.ts | State change events |
| Visual Actions | claude-mood.ts, achievement-badges.ts | State data |
| Infrastructure | Hook updates, manifest.json, plugin.ts | Must be sequential |

### File Ownership Matrix
- **Agent A** (Displays): tool-breakdown.ts, speed-meter.ts
- **Agent B** (Controls): quick-notes.ts, prompt-preset.ts, clipboard-send.ts
- **Agent C** (Alerts): error-flash.ts, idle-detector.ts, sound-fx.ts
- **Agent D** (Visual): claude-mood.ts, achievement-badges.ts
- **Main Agent** (Infrastructure): manifest.json, plugin.ts, hooks, icons

## Implementation Phases

### Phase 1: Enhanced Displays (Parallel)
**Objective**: Add compaction alert behavior and tool breakdown display

**Parallel Tasks**:
1. **Task 1A**: Modify context-bar.ts to pulse/animate when >80% - Owns: context-bar.ts
2. **Task 1B**: Create tool-breakdown.ts with pie chart SVG - Owns: tool-breakdown.ts

**Files to Modify**:
- `src/actions/context-bar.ts` - Add pulsing animation - Owner: 1A

**New Files to Create**:
- `src/actions/tool-breakdown.ts` - Pie chart display - Owner: 1B

**Phase Verification**:
- [ ] Context bar pulses when state.contextPercent > 80
- [ ] Tool breakdown shows Read/Write/Edit/Bash distribution

---

### Phase 2: Control Actions (Parallel)
**Objective**: Add quick notes, prompt presets, and clipboard functionality

**Parallel Tasks**:
1. **Task 2A**: Create quick-notes.ts - text input action - Owns: quick-notes.ts
2. **Task 2B**: Create prompt-preset.ts - saved prompt action - Owns: prompt-preset.ts
3. **Task 2C**: Create clipboard-send.ts - paste clipboard - Owns: clipboard-send.ts

**New Files to Create**:
- `src/actions/quick-notes.ts` - Owner: 2A
- `src/actions/prompt-preset.ts` - Owner: 2B
- `src/actions/clipboard-send.ts` - Owner: 2C

**Phase Verification**:
- [ ] Quick notes can type text to terminal
- [ ] Prompt presets configurable in property inspector
- [ ] Clipboard sends current clipboard content

---

### Phase 3: Alert System (Parallel)
**Objective**: Add error detection, idle detection, and sound effects

**Parallel Tasks**:
1. **Task 3A**: Create error-flash.ts - monitors for errors - Owns: error-flash.ts
2. **Task 3B**: Create idle-detector.ts - shows waiting state - Owns: idle-detector.ts
3. **Task 3C**: Create sound-fx.ts - plays sounds on events - Owns: sound-fx.ts

**New Files to Create**:
- `src/actions/error-flash.ts` - Owner: 3A
- `src/actions/idle-detector.ts` - Owner: 3B
- `src/actions/sound-fx.ts` - Owner: 3C

**Infrastructure Updates** (sequential, main agent):
- Update hooks to track error states and idle time
- Add sound file assets if needed

**Phase Verification**:
- [ ] Error flash pulses when state.status === 'error'
- [ ] Idle detector shows when awaiting input
- [ ] Sound FX toggle works (may need user permission)

---

### Phase 4: Visual & Fun (Parallel)
**Objective**: Add animated mood display and achievement tracking

**Parallel Tasks**:
1. **Task 4A**: Create claude-mood.ts - animated face - Owns: claude-mood.ts
2. **Task 4B**: Create achievement-badges.ts - milestone tracking - Owns: achievement-badges.ts

**New Files to Create**:
- `src/actions/claude-mood.ts` - Owner: 4A
- `src/actions/achievement-badges.ts` - Owner: 4B

**Phase Verification**:
- [ ] Claude mood changes based on status (happy, thinking, working)
- [ ] Achievements track: tool count milestones, cost milestones, session count

---

### Phase 5: Infrastructure Integration (Sequential)
**Objective**: Wire everything together

**Sequential Tasks**:
1. Update manifest.json with all new actions
2. Update plugin.ts to register all new actions
3. Create all SVG icons for new actions
4. Create property inspector HTML files for configurable actions
5. Update hooks to track additional state (errors, idle time)
6. Build and test

**Files to Modify**:
- `manifest.json` - Add 10 new action definitions
- `plugin.ts` - Import and register new actions
- `hooks/claude-deck-hook.sh` - Add error/idle tracking

**New Files to Create**:
- `imgs/actions/*.svg` - Icons for each new action
- `ui/prompt-preset-pi.html` - Property inspector

---

### Phase 6: Final Review
**MANDATORY**:
1. Run `final-review-completeness` agent - check no TODOs/mocks
2. Run `principal-code-reviewer` agent - quality assessment
3. Full build and manual test on Stream Deck

## Testing Strategy
- Build plugin: `npm run build`
- Copy to Stream Deck plugins folder
- Restart Stream Deck
- Test each new button manually
- Verify state updates propagate to displays

## Rollback Plan
- Git reset if catastrophic
- Individual action files can be deleted to disable features
- Manifest entries can be removed to hide actions

## Risks and Mitigations
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Context compaction mid-implementation | High | High | Prioritize Tier 1 features first |
| Sound FX permissions | Med | Low | Make optional/toggleable |
| Performance with animations | Low | Med | Use requestAnimationFrame, 2s intervals |

## Recommended Approach Given Context (84%)

**IMMEDIATE PRIORITY** - Implement only Tier 1 in this session:
1. ✅ Compaction Alert (modify existing context-bar.ts)
2. ✅ Tool Breakdown display
3. ✅ Idle Detector
4. ✅ Error Flash
5. ✅ Claude Mood (fun!)

This gives 5 high-impact features while staying within context limits.

---
**USER: Please review this plan. Type "proceed" to implement Tier 1 features, or edit the plan and specify which features you want.**
