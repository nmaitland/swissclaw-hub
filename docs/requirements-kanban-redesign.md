# Kanban Redesign Proposal

## Status: PROPOSED
**Date:** 2026-02-07
**Priority:** High

---

## Current State

The dashboard currently shows three separate sections:
- **Status Card:** Shows SwissClaw's current status and task
- **Kanban Summary:** Shows "In Progress", "Next Up", "Recently Done" as mini-lists
- **Your Action Items:** Separate section for Neil's pending tasks

This is fragmented and doesn't fully leverage the database-backed kanban API.

---

## Proposed Design

Replace the three separate windows with a **single unified kanban board** with status columns and proper ticket cards.

### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  BACKLOG │ TO DO │ IN PROGRESS │ REVIEW │ DONE │ WAITING FOR NEIL │
├─────────────────────────────────────────────────────────────────────┤
│ [Card]   │ [Card]│ [Card]      │ [Card] │ [Card]│ [Card]          │
│ [Card]   │ [Card]│ [Card]      │        │ [Card]│                 │
│          │ [Card]│             │        │       │                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Columns/Status

| Column | Purpose | Drag Target |
|--------|---------|-------------|
| **Backlog** | Ideas, future work, not yet prioritized | → To Do |
| **To Do** | Work ready to start | → In Progress |
| **In Progress** | Currently being worked on | → Review / Blocked |
| **Review** | Done, waiting for review/approval | → Done / Waiting for Neil |
| **Done** | Completed work | — |
| **Waiting for Neil** | Tasks blocked on Neil's input/action | — |

### Card Design

Each ticket/card shows:
```
┌─────────────────────────────────┐
│ 🦀 TASK-001  [PRIORITY]         │
│                                 │
│ Implement OAuth2 login flow     │
│                                 │
│ 👤 Assigned: SwissClaw    📎 2   │
│ 🏷️ auth, security        💬 3   │
│ 📅 Created: Feb 5             │
└─────────────────────────────────┘
```

**Card elements:**
- Icon + ID number (auto-generated)
- Priority badge (High/Medium/Low)
- Title (truncated if long)
- Assignee avatar/name
- Attachment count
- Comment count
- Tags/labels
- Creation date

### Neil's Action Items

**Option A: Separate Column (Recommended)**
- Add "Waiting for Neil" as a dedicated column on the right
- When I need Neil's input, I move cards there
- Clear visual indicator that action is needed

**Option B: Assignment + Visual Indicator**
- Tasks assigned to Neil show with a different color border (e.g., blue instead of orange)
- Could still be in any column (e.g., "In Progress" but assigned to Neil)
- Less clear as a "needs attention" signal

**Option C: Swimlane**
- Horizontal sections within columns
- Top lane: SwissClaw's items
- Bottom lane: Neil's items
- More complex, might be overkill

**Recommendation:** Option A (dedicated column) — it's clean, clear, and leverages the kanban metaphor for "blocked/waiting".

### Interactions

| Action | Behavior |
|--------|----------|
| **Drag & Drop** | Move cards between columns to change status |
| **Click Card** | Open detail modal with full description, comments, history |
| **Add Task** | "+" button per column to create new card in that status |
| **Filter** | Filter by assignee, priority, tag |
| **Search** | Real-time search across card titles/descriptions |

### API Integration

**Already exists:** `/api/kanban` endpoint with full CRUD
- `GET /api/kanban` — fetch all tasks
- `POST /api/kanban` — create task
- `PUT /api/kanban/:id` — update task (including status)
- `DELETE /api/kanban/:id` — delete task

**New fields needed:**
- `assignedTo`: `null | "swissclaw" | "neil"`
- `column`: `"backlog" | "todo" | "inprogress" | "review" | "done" | "waiting-for-neil"`
- `priority`: `"high" | "medium" | "low"`
- `tags`: string[]

### UI/UX Details

**Visual Design:**
- Columns have subtle gradient backgrounds
- Cards have shadows for depth perception
- Dragging shows ghost preview
- Smooth animations on status change
- Responsive: horizontal scroll on mobile, or stack columns vertically

**Color Coding:**
- Default cards: white/light gray border
- High priority: Red accent on left border
- Neil's items: Blue accent (if using Option B)
- Waiting for Neil column: Yellow/amber tint background

### Migration Plan

1. **Phase 1:** Update `/api/kanban` to support new schema (columns, assignment)
2. **Phase 2:** Build new kanban component (static, non-draggable)
3. **Phase 3:** Add drag-and-drop (react-beautiful-dnd or @dnd-kit)
4. **Phase 4:** Replace old dashboard sections entirely
5. **Phase 5:** Archive/delete old components

### Success Criteria

- [ ] Single kanban view replaces 3 separate sections
- [ ] Drag-and-drop to change status
- [ ] Neil's action items clearly visible (dedicated column)
- [ ] Card detail modal shows full task info
- [ ] Create new tasks inline
- [ ] Mobile responsive
- [ ] Real-time updates via WebSocket (optional stretch)

### Open Questions

1. Should we keep "Recently Done" as a collapsed section, or just show full Done column?
2. Do we need a "Blocked" column separate from "Waiting for Neil"?
3. Should items auto-archive after X days in Done?
4. Priority on this vs. other todos (Zwift integration, CV matcher)?

---

**Next Step:** Neil to review and approve/revise this proposal. Then add to "To Do" and start Phase 1 (API schema update).