# Claude Deck Layouts

Recommended button layouts for different Stream Deck sizes.

## Available Actions

### Control Actions (Interactive)
| Action | Description |
|--------|-------------|
| Approve | Accept pending permission |
| Reject | Decline pending permission |
| Interrupt | Stop current operation (Ctrl+C) |
| YOLO Mode | Toggle bypass all permissions |
| Plan Mode | Toggle read-only mode |
| Switch Model | Cycle Sonnet/Opus |
| New Session | Start fresh Claude session |
| Continue | Resume last session |
| Toggle Thinking | Extended thinking on/off |

### Display Actions (Info Panels)
| Action | Shows |
|--------|-------|
| Token Counter | Input/Output/Total tokens |
| Model Badge | Current model with color |
| Mode Badge | Current permission mode |
| Activity Monitor | Status + last tool + call count |
| Cost Tracker | Estimated session cost |
| Status | Working/Idle/Waiting state |

---

## Stream Deck Mini (6 buttons, 3×2)

**Essential controls only:**

```
┌─────────┬─────────┬─────────┐
│    ✓    │    ✕    │    ⏹    │
│ Approve │ Reject  │  Stop   │
├─────────┼─────────┼─────────┤
│   🔓    │   📊    │   🔄    │
│  YOLO   │ Activity│  Model  │
└─────────┴─────────┴─────────┘
```

**Why this layout:**
- Top row: Core permission controls (most used)
- Bottom row: Mode toggle + status + model switch

---

## Stream Deck Neo (8 buttons, 4×2)

**Essential + displays:**

```
┌─────────┬─────────┬─────────┬─────────┐
│    ✓    │    ✕    │    ⏹    │   ↩    │
│ Approve │ Reject  │  Stop   │  Cont   │
├─────────┼─────────┼─────────┼─────────┤
│   🔓    │   📋    │ [Model] │[Tokens] │
│  Mode   │  Plan   │  Badge  │ Counter │
└─────────┴─────────┴─────────┴─────────┘
```

---

## Stream Deck (15 buttons, 5×3)

**Full control panel:**

```
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│    ✓    │    ✕    │    ⏹    │    ↩    │    +    │
│ Approve │ Reject  │  Stop   │  Cont   │   New   │
├─────────┼─────────┼─────────┼─────────┼─────────┤
│  [Mode] │  [Model]│   🧠    │  Commit │ Review  │
│  Badge  │  Badge  │  Think  │   /c    │   /r    │
├─────────┼─────────┼─────────┼─────────┼─────────┤
│[Activity│ [Token] │ [Cost]  │         │         │
│ Monitor]│ Counter]│ Tracker]│  Empty  │  Empty  │
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

**Row breakdown:**
- **Row 1**: Permission controls + session management
- **Row 2**: Mode/model displays + settings + slash commands
- **Row 3**: Live info panels (tokens, activity, cost)

---

## Stream Deck XL (32 buttons, 8×4)

**Command center layout:**

```
┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐
│    ✓    │    ✕    │    ⏹    │    ↩    │    +    │         │ [Model] │  [Mode] │
│ Approve │ Reject  │  Stop   │  Cont   │   New   │  Clear  │  Badge  │  Badge  │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│   🔓    │   📋    │   ✏️    │   🚫    │   🧠    │   📢    │         │         │
│  YOLO   │  Plan   │  Edits  │  Deny   │  Think  │ Verbose │ Custom  │ Custom  │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│  Commit │ Review  │  Init   │ Doctor  │  Help   │  Config │         │         │
│   /c    │   /r    │   /i    │   /d    │   /h    │   /s    │ Custom  │ Custom  │
├─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┼─────────┤
│[Activity│ [Token] │ [Cost]  │ [Status]│         │         │         │         │
│ Monitor]│ Counter]│ Tracker]│ Display]│  Empty  │  Empty  │  Empty  │  Empty  │
└─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘
```

**Row breakdown:**
- **Row 1**: Core controls + session + live badges
- **Row 2**: All permission modes + settings toggles
- **Row 3**: Slash commands
- **Row 4**: Info panels + expansion space

---

## Stream Deck + (8 buttons + 4 dials)

**Hybrid layout with dials:**

```
Buttons:
┌─────────┬─────────┬─────────┬─────────┐
│    ✓    │    ✕    │    ⏹    │    ↩    │
│ Approve │ Reject  │  Stop   │  Cont   │
├─────────┼─────────┼─────────┼─────────┤
│ [Model] │  [Mode] │[Activity│ [Token] │
│  Badge  │  Badge  │ Monitor]│ Counter]│
└─────────┴─────────┴─────────┴─────────┘

Dials (touch + rotate):
┌─────────┬─────────┬─────────┬─────────┐
│  Model  │  Mode   │ Volume  │  Scroll │
│ Selector│ Selector│ (audio) │ (term)  │
└─────────┴─────────┴─────────┴─────────┘
```

**Dial usage ideas:**
- **Dial 1**: Rotate to cycle models, press to confirm
- **Dial 2**: Rotate to cycle permission modes
- **Dial 3-4**: Reserved for future features

---

## Multi-Profile Setup

For power users, consider multiple Stream Deck profiles:

### Profile 1: "Claude Control"
- Primary permission and session controls
- Quick access to approve/reject/stop

### Profile 2: "Claude Info"
- All display panels (tokens, cost, activity)
- Status monitoring focused

### Profile 3: "Claude Commands"
- All slash commands (/commit, /review, etc.)
- Custom prompt buttons

**Profile switching:** Use a Stream Deck button to switch profiles, or set up automatic profile switching when Claude Code is active.

---

## Color Legend

The display panels use consistent color coding:

| Color | Meaning |
|-------|---------|
| 🟢 Green | Input tokens, working status, success |
| 🔴 Red | Reject, YOLO mode, error, high cost |
| 🟡 Yellow | Waiting, moderate cost |
| 🟣 Purple | Opus model |
| 🟠 Orange | Sonnet model |
| 🔵 Cyan | Haiku model, plan mode |
| ⚪ Gray | Idle, disabled |

---

## Tips

1. **Most-used at top**: Put Approve/Reject where your thumb naturally rests
2. **Group by function**: Controls together, displays together
3. **Leave expansion room**: Keep some buttons empty for future features
4. **Use display actions**: They show info AND are interactive (tap to toggle)
5. **Match your workflow**: If you rarely use YOLO mode, swap it for something else
