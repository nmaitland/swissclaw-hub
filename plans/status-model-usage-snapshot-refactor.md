# Status + Model Usage Contract Refactor (Snapshot-Based)

## Summary
Refactor status and model-usage APIs so they match operational reality:
1. `/api/status` becomes a compact status endpoint (no chat/activity lists), includes counts and latest model-usage snapshot summary.
2. Model usage changes from append-only events to daily upsert snapshots (multiple updates/day allowed, last update wins).
3. Chat/activity history remains on dedicated endpoints with limits/cursors for large datasets.

## Public API / Interface Changes

## 1) `GET /api/status` response contract
Return only:
- `state`
- `currentTask`
- `lastActive`
- `chatCount` (since midnight Europe/Zurich)
- `activityCount` (since midnight Europe/Zurich)
- `modelUsage` (latest snapshot summary + timestamp)

Remove from `/api/status`:
- `recentMessages`
- `recentActivities`
- old aggregate shape that depended on summing `model_usage` rows

## 2) `PUT /api/service/status` contract
Update request body to require:
- `state`
- `currentTask`
- `lastActive` (service-provided ISO datetime)

Fix persistence bug:
- replace current faulty UUID-based "upsert" with true singleton status row behavior.

## 3) Model usage write endpoint
Use snapshot semantics:
- `PUT /api/service/model-usage`
- Body includes:
  - `usageDate` (YYYY-MM-DD, provided by service)
  - `updatedAt` (ISO datetime, provided by service)
  - `models` array only (no totals in payload)
- Each model row includes:
  - model identity fields (existing `model` string plus provider/source if provided)
  - `inputTokens`, `outputTokens`, `requestCount`
  - typed costs per model: `costs: [{ type: "paid" | "free_tier_potential", amount }]`

Write behavior:
- upsert one row per `usageDate` (latest timestamped update replaces prior snapshot for that day).

## 4) Model usage read endpoint (history)
Add:
- `GET /api/model-usage?date=YYYY-MM-DD`
- `GET /api/model-usage?startDate=YYYY-MM-DD&limit=N`

Behavior:
- returns one snapshot per day (already "last value of day" because writes upsert by day).
- auth-protected like other `/api` routes.

## 5) Messages/activities scalability
- `GET /api/messages` gains:
  - `limit` (default 25, max 200)
  - `before` cursor (ISO datetime)
- `GET /api/activities` keeps existing:
  - `limit` (default 20, max 100)
  - `before` cursor
- `/api/status` no longer used for list retrieval.

## Data Model / Storage Plan

## 1) New snapshot table
Introduce a daily snapshot table (or repurpose existing with migration) with unique `usage_date`:
- `usage_date` (date, unique)
- `updated_at` (timestamptz)
- `models_json` (jsonb, validated shape)
- optional derived totals columns for fast status reads

## 2) Derived totals
Server computes totals from `models` at write/read:
- total input/output/requests
- typed cost totals (paid + free-tier-potential)
- grand total tokens

No totals accepted from service payload.

## 3) Migration strategy
- existing `status` and `model_usage` data does not need to be retained.
- purge existing rows before applying new schema and contract changes.
- migrate away from current append-row `model_usage` semantics.
- no legacy backfill is required.
- update reset/seed/test helpers accordingly.

## 4) Data reset step (explicit)
- before schema migration:
  - `TRUNCATE TABLE status RESTART IDENTITY CASCADE;`
  - `TRUNCATE TABLE model_usage RESTART IDENTITY CASCADE;`
- then apply the new table format and API logic.

## Script and CLI Plan

## 1) `scripts/hub-api.ts` (generic CLI)
Keep previously agreed command surface, with model-usage command updated:
- `model-usage put --usage-date --updated-at --models-json ...`
- `model-usage get --date ...`
- `model-usage history --start-date --limit ...`

Output:
- human-readable default
- `--json` supported on all commands

## 2) `scripts/chat-bridge-webhook.ts`
- remain listener/webhook-focused
- keep `--send` compatibility via shared client delegation
- auto message-state update: only `received`

## 3) External compatibility (`C:\code\personal\swissclaw`)
- update wrappers (`chat-reply.sh`, `kanban/api-helper.sh`) to call new CLI paths while preserving signatures and workflows.

## UI and Client Changes

## 1) Types
Update `StatusResponse` in client to new compact shape plus embedded `modelUsage` snapshot summary.

## 2) Data fetching
- stop expecting lists from `/api/status`
- fetch chat/activity lists from `/api/messages` and `/api/activities` directly (with limits/cursors)
- render model usage from status-embedded latest snapshot

## 3) Display semantics
Show:
- latest snapshot update time (`updatedAt`)
- current totals derived from that snapshot
- per-model breakdown with typed costs

## Test Cases and Scenarios

## 1) Backend API tests
- `/api/status` exact response shape and absence of list fields
- counts use Europe/Zurich midnight boundary
- `/api/service/status` requires `lastActive` and persists singleton correctly
- `/api/service/model-usage` upserts by `usageDate` (multiple writes/day overwrite)
- model totals are computed from models (not accepted from payload)
- `/api/model-usage` date lookup and startDate+limit history behavior
- `/api/messages` limit/default/max/before pagination

## 2) Client tests
- app no longer depends on `recentMessages` / `recentActivities` in status response
- model usage panel reflects latest snapshot + updated timestamp
- message/activity list loading works from dedicated endpoints

## 3) Script tests (targeted)
- CLI parsing for new model-usage put/get/history commands
- `--json` output contracts
- auth lock behavior (wait up to 30s, stale lock break at 120s)
- bridge receive path sets message state to `received`

## Assumptions and Defaults
- Model usage day key is service-provided `usageDate`.
- Snapshot writes happen multiple times/day; only the latest per day is kept.
- Typed costs are per-model (`paid`, `free_tier_potential`), totals are server-derived.
- `/api/status` embeds only current/latest model usage summary, not historical series.
- History access is via dedicated `/api/model-usage` endpoint.
