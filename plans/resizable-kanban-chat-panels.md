# Resizable Kanban/Chat Vertical Panels

## Summary

Add a vertical space splitter between the Kanban and Chat sections so the chat panel can be expanded at the expense of Kanban (and vice versa).

- Desktop: draggable horizontal splitter with keyboard support.
- Mobile: preset size buttons (no drag) for reliability.
- Persist user preference in localStorage.
- No backend, API, or database changes.

## Goals and Acceptance Criteria

1. User can resize Kanban and Chat vertically on desktop by dragging a splitter.
2. Height adjustments are constrained by safe minimum heights so neither panel breaks.
3. Resize preference persists after browser refresh.
4. Mobile layout uses presets (Kanban, Balanced, Chat) and persists selected preset.
5. Existing activity/status/chat/kanban behavior remains intact.

## Current State (Observed)

- In `client/src/App.tsx`, layout order is:
  - top-panels (status + activities)
  - kanban
  - chat panel
- In `client/src/App.css`, chat and activity areas use fixed caps (for example `max-height: 200px`), and there is no panel splitter.
- Kanban uses internal scrollable columns and viewport-based max heights in `client/src/components/KanbanBoard.css`.

## Files to Change

- `client/src/App.tsx`
- `client/src/App.css`
- `client/src/__tests__/App.test.js`

## Design Decisions (Locked)

1. Desktop interaction: drag handle splitter.
2. Persistence: enabled using localStorage.
3. Mobile behavior: no drag; preset controls.
4. Default split: 65% Kanban / 35% Chat.
5. PR base branch: `master`.

## State and Persistence

Add UI state in `App.tsx`:

- `chatRatioDesktop` (number, default `0.35`) where ratio represents Chat share of the combined Kanban+Chat region.
- `mobilePreset` (`'kanban' | 'balanced' | 'chat'`, default `'balanced'`).
- `isMobileLayout` (boolean from `matchMedia('(max-width: 768px)')`).

Persist keys:

- `hub.chatPanelRatio.v1` -> numeric ratio
- `hub.mobilePanelPreset.v1` -> preset string

Validation rules:

- Parse and clamp ratio to valid range derived from panel min heights and container height.
- Fall back to defaults if parse fails.

## Layout and Interaction Implementation

### 1. Resizable wrapper in `App.tsx`

Wrap Kanban and Chat in a new container, for example:

- `workspace-panels` (combined region)
- `kanban-panel-wrap`
- `panel-splitter`
- existing `chat-panel`

### 2. Desktop drag behavior

- Enable splitter drag only when `isMobileLayout === false`.
- Use pointer events (`pointerdown`, `pointermove`, `pointerup`) with window listeners during drag.
- Compute ratio from pointer Y against container bounds.
- Clamp with min heights:
  - `KANBAN_MIN_PX = 280`
  - `CHAT_MIN_PX = 220`
- While dragging, add/remove a `body` class to disable selection/cursor flicker.

### 3. Keyboard accessibility

Splitter should support keyboard input:

- `role="separator"`
- `aria-orientation="horizontal"`
- `tabIndex={0}`
- keys:
  - `ArrowUp`: decrease chat ratio by 0.02
  - `ArrowDown`: increase chat ratio by 0.02
  - `Home`: set min chat ratio
  - `End`: set max chat ratio

### 4. Mobile preset behavior

At `max-width: 768px`:

- Hide draggable affordance.
- Show preset controls in splitter area:
  - `Kanban` -> chat ratio `0.25`
  - `Balanced` -> chat ratio `0.35`
  - `Chat` -> chat ratio `0.45`
- Persist selected preset.

### 5. CSS adjustments in `App.css`

- Add styles for `workspace-panels`, `kanban-panel-wrap`, and `panel-splitter`.
- Drive panel sizes using CSS variable from inline style (or equivalent calculated heights).
- Remove chat hard cap that blocks resizing:
  - change `.chat-messages { max-height: 200px; }` to flexible scrolling behavior (`min-height: 0` and overflow).
- Keep existing chat input textarea behavior unchanged.
- Ensure panel contents continue to scroll internally, not page-level overflow.

### 6. Kanban constraints

- Do not modify KanbanBoard component behavior unless wrapper-level CSS is insufficient.
- Prefer container-level fixes first to avoid risk to drag-and-drop behavior.

## Test Plan

Update `client/src/__tests__/App.test.js`:

1. Loads persisted ratio from localStorage.
2. Renders splitter in desktop mode.
3. Simulates drag update and verifies localStorage write.
4. Simulates mobile mode (`matchMedia`) and verifies preset control rendering.
5. Verifies preset selection persists.
6. Confirms existing smoke behaviors still pass (header, chat input, activities, mocked kanban).

Run validation:

1. `cd client && npm test -- --runInBand`
2. `npm run test:client`
3. Optional full checks before PR:
   - `npm run type-check`
   - `npm test`

## Branch, Commit, and PR Etiquette

1. Confirm tooling and auth:
   - `gh auth status`
   - `gh repo view nmaitland/swissclaw-hub`
2. Sync and branch from `master`:
   - `git switch master`
   - `git pull --ff-only origin master`
   - `git switch -c feat/resizable-kanban-chat-panels`
3. Make only scoped changes:
   - `client/src/App.tsx`
   - `client/src/App.css`
   - `client/src/__tests__/App.test.js`
4. Commit message:
   - `feat(ui): add resizable kanban-chat split with persistence`
5. Push and open PR:
   - `git push -u origin feat/resizable-kanban-chat-panels`
   - `gh pr create --base master --head feat/resizable-kanban-chat-panels --title "feat(ui): resizable kanban/chat vertical panels" --body "<summary + tests>"`
6. Check CI and PR health:
   - `gh pr checks --watch`

## Risk Notes

1. Existing fixed max-heights may conflict with new resize behavior if not removed carefully.
2. Pointer handling can interfere with text selection unless drag mode is controlled tightly.
3. Small viewports require strict min-height handling to prevent layout jitter.

## Out of Scope

1. No backend API changes.
2. No Kanban feature changes beyond layout integration.
3. No redesign of visual theme.
