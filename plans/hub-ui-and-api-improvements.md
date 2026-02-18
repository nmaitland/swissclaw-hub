# Hub UI & API Improvements Plan

Four features, each implemented as a separate commit with tests.

---

## Step 1: Status Panel API — Make It Dynamic

### Problem
The [`GET /api/status`](server/index.ts:653) endpoint returns **hardcoded** status data:
```typescript
swissclaw: {
  state: 'active',
  currentTask: 'Building Swissclaw Hub',
  lastActive: new Date().toISOString()
}
```

A `status` table already exists in the database (migration [`20260212000008-create-status.js`](database/migrations/20260212000008-create-status.js)) with columns: `id`, `status`, `current_task`, `last_updated` — but it is never read or written to.

> **Note:** Model usage reporting already works via [`POST /api/service/model-usage`](server/index.ts:544) which accepts `{ inputTokens, outputTokens, model, estimatedCost }` and is already aggregated in `GET /api/status`. No changes needed for model usage.

### Changes

**Server — [`server/index.ts`](server/index.ts)**

1. **New endpoint: `PUT /api/service/status`** — Service-to-service endpoint (authenticated via `x-service-token`) to update the status panel data:
   ```
   PUT /api/service/status
   Body: { state: 'active'|'busy'|'idle', currentTask: string }
   ```
   - Upserts a single row in the `status` table (use `INSERT ... ON CONFLICT` since there should only be one row)
   - Broadcasts the new status via Socket.IO: `io.emit('status-update', { state, currentTask, lastActive })`

2. **Modify `GET /api/status`** — Read `swissclaw` state from the `status` table instead of hardcoding it. Fall back to `idle` / `Ready to help` if no row exists.

**Client — [`client/src/App.tsx`](client/src/App.tsx)**

3. Listen for `status-update` Socket.IO events and update the status panel in real-time (no need to wait for the 30s polling interval).

**Types**

4. Add `StatusUpdate` type to both [`server/types/index.ts`](server/types/index.ts) and [`client/src/types/index.ts`](client/src/types/index.ts).

**Tests**

5. Integration test for `PUT /api/service/status` — verify it updates the DB and that `GET /api/status` reflects the change.

**Documentation**

6. **Swagger** — Add `@swagger` JSDoc to the new `PUT /api/service/status` endpoint in [`server/index.ts`](server/index.ts).
7. **MCP server** — Add `update_status` tool to [`server/mcp-server.ts`](server/mcp-server.ts) that calls `PUT /api/service/status`. Also add it to the MCP server docs in [`docs/mcp-server.md`](docs/mcp-server.md) under the Status section.
8. **README** — Add `update_status` to the MCP tools table in [`README.md`](README.md:184).

---

## Step 2: Activities Panel — Fixed Height + Auto-Scroll to Latest

### Problem
The activities panel has `height: 180px` in CSS ([`App.css:107`](client/src/App.css:107)) but when new activities arrive via Socket.IO, the panel does not scroll to show the latest item at the top.

### Changes

**CSS — [`client/src/App.css`](client/src/App.css)**

1. Set the activity panel to a fixed height that fits ~8 lines of activity items. Each item is roughly 2.5rem tall with gap, so ~20rem / 320px. The `.activity-feed` already has `overflow-y: auto` via `.panel-content`.

   ```css
   .panel.activity-panel {
     height: 320px;  /* ~8 activity lines */
   }
   ```

**Client — [`client/src/App.tsx`](client/src/App.tsx)**

2. Add a ref for the activity feed container and scroll to top when a new activity arrives (since activities are displayed newest-first):
   ```typescript
   const activityFeedRef = useRef<HTMLDivElement>(null);
   ```
   
3. In the Socket.IO `activity` handler, after updating state, scroll the feed to the top:
   ```typescript
   newSocket.on('activity', (activity: Activity) => {
     setActivities((prev) => [activity, ...prev].slice(0, 50));
     // Scroll to top to show latest activity
     setTimeout(() => {
       activityFeedRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
     }, 50);
   });
   ```

4. Attach the ref to the activity feed div:
   ```tsx
   <div className="panel-content activity-feed" ref={activityFeedRef}>
   ```

**Tests**

5. Update client test if it references activity panel structure.

---

## Step 3: Chat Window — Always Scroll to Bottom on New Messages

### Problem
Currently, the chat only scrolls to bottom on initial load ([`App.tsx:220`](client/src/App.tsx:220)) and when the user sends a message ([`App.tsx:257`](client/src/App.tsx:257)). When a new message arrives from Socket.IO or from the 30s polling refresh, the chat does NOT auto-scroll.

### Changes

**Client — [`client/src/App.tsx`](client/src/App.tsx)**

1. **Always scroll to bottom when messages change.** Replace the current two separate scroll effects with a single unified one:

   ```typescript
   // Always scroll to bottom when messages change
   useEffect(() => {
     if (messages.length > 0) {
       messagesEndRef.current?.scrollIntoView({ 
         behavior: hasInitiallyScrolled.current ? 'smooth' : 'auto' 
       });
       hasInitiallyScrolled.current = true;
     }
   }, [messages]);
   ```

2. Remove the `shouldAutoScroll` ref and the separate effect that uses it — they are no longer needed since we always scroll.

3. Remove the `messages.length`-only effect (lines 220-225) since the unified effect above handles both initial and subsequent scrolls.

**Tests**

4. Verify existing client tests still pass.

---

## Step 4: Chat Message Processing State Endpoint + UI Indicators

### Problem
When a user sends a message, there is no feedback about what the external chat processor (Swissclaw agent) is doing with it. The user just sees their message and waits.

### Design

A new service endpoint allows the external processor to report its state for a specific message. The state is broadcast via Socket.IO and displayed as animated indicators in the chat UI.

### State Machine

```
sent -> received -> processing -> thinking -> responded
```

Each state has a visual indicator:
- **received** — checkmark icon
- **processing** — spinning gear icon  
- **thinking** — animated dots (ellipsis pulse)
- **responded** — no indicator (the response message itself is the indicator)

### Changes

**Server — [`server/index.ts`](server/index.ts)**

1. **New endpoint: `PUT /api/service/messages/:id/state`** — Service-to-service endpoint:
   ```
   PUT /api/service/messages/:id/state
   Body: { state: 'received'|'processing'|'thinking'|'responded' }
   ```
   - Validates the message ID exists
   - Broadcasts via Socket.IO: `io.emit('message-state', { messageId, state })`
   - No need to persist state in DB — it is transient/ephemeral

2. Add Swagger documentation for the new endpoint.

**Client — [`client/src/types/index.ts`](client/src/types/index.ts)**

3. Add `MessageState` type:
   ```typescript
   export type MessageProcessingState = 'received' | 'processing' | 'thinking' | 'responded';
   
   export interface MessageStateUpdate {
     messageId: string;
     state: MessageProcessingState;
   }
   ```

**Client — [`client/src/App.tsx`](client/src/App.tsx)**

4. Add state tracking for message processing states:
   ```typescript
   const [messageStates, setMessageStates] = useState<Record<string, MessageProcessingState>>({});
   ```

5. Listen for `message-state` Socket.IO events:
   ```typescript
   newSocket.on('message-state', ({ messageId, state }: MessageStateUpdate) => {
     setMessageStates(prev => ({ ...prev, [messageId]: state }));
   });
   ```

6. Render state indicators next to the last user message:
   ```tsx
   {messageStates[msg.id] && messageStates[msg.id] !== 'responded' && (
     <span className={`message-state message-state-${messageStates[msg.id]}`}>
       {messageStates[msg.id] === 'received' && '✓'}
       {messageStates[msg.id] === 'processing' && '⚙️'}
       {messageStates[msg.id] === 'thinking' && '...'}
     </span>
   )}
   ```

**CSS — [`client/src/App.css`](client/src/App.css)**

7. Add message state indicator styles:
   ```css
   .message-state {
     display: inline-block;
     margin-left: 0.5rem;
     font-size: 0.75rem;
     vertical-align: middle;
   }
   
   .message-state-received {
     color: #4ade80;
   }
   
   .message-state-processing {
     animation: spin 1s linear infinite;
   }
   
   .message-state-thinking {
     color: #f59e0b;
     animation: pulse 1.5s ease-in-out infinite;
   }
   
   @keyframes spin {
     from { transform: rotate(0deg); }
     to { transform: rotate(360deg); }
   }
   ```

**Tests**

8. Integration test for `PUT /api/service/messages/:id/state` — verify it validates message ID and broadcasts the event.

**Documentation**

9. **Swagger** — Add `@swagger` JSDoc to the new `PUT /api/service/messages/:id/state` endpoint in [`server/index.ts`](server/index.ts).
10. **MCP server** — Add `update_message_state` tool to [`server/mcp-server.ts`](server/mcp-server.ts) that calls `PUT /api/service/messages/:id/state`. Update [`docs/mcp-server.md`](docs/mcp-server.md) Chat section with the new tool.
11. **README** — Add `update_message_state` to the MCP tools table in [`README.md`](README.md:184).

---

## Implementation Order

Each step is independent and should be committed + pushed + CI verified before moving to the next:

1. **Step 1** — Status panel API (server + client + test + docs)
2. **Step 2** — Activities panel fixed height + auto-scroll (CSS + client)
3. **Step 3** — Chat always scroll to bottom (client)
4. **Step 4** — Message processing state (server + client + CSS + test + docs)

## Files Modified Per Step

| Step | Server | Client | CSS | Types | Tests | Docs |
|------|--------|--------|-----|-------|-------|------|
| 1 | `server/index.ts` | `client/src/App.tsx` | — | Both | New integration test | `server/mcp-server.ts`, `docs/mcp-server.md`, `README.md` |
| 2 | — | `client/src/App.tsx` | `client/src/App.css` | — | — | — |
| 3 | — | `client/src/App.tsx` | — | — | — | — |
| 4 | `server/index.ts` | `client/src/App.tsx` | `client/src/App.css` | `client/src/types/index.ts` | New integration test | `server/mcp-server.ts`, `docs/mcp-server.md`, `README.md` |
