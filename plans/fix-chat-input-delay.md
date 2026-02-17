# Fix: Chat Input Slow to Enable After Login/Refresh

## Problem

When a user first logs in or refreshes the hub, the chat input box stays disabled for several seconds before becoming usable. The input is gated on `socket?.connected` being `true`.

## Root Cause

The delay is caused by a chain of sequential operations:

```
Page Load -> React render -> useEffect creates Socket.IO client ->
  Socket.IO handshake (HTTP long-polling first) ->
    Server auth middleware (2 sequential DB queries) ->
      Socket connected event -> React re-render -> Input enabled
```

Contributing factors:
1. **Socket.IO defaults to long-polling** before upgrading to WebSocket, adding extra round-trips
2. **Server auth middleware runs 2 sequential DB queries** per socket connection (validate + update last_accessed)
3. **No user feedback** while connecting - input just appears disabled with no explanation
4. **Render.com network latency** between web service and database adds to each DB query

## Fixes

### Fix 1: Force WebSocket-Only Transport

**File:** `client/src/App.tsx` (line 94)

**Current:**
```typescript
const newSocket = io(API_URL || window.location.origin, {
  auth: { token: getAuthToken() },
});
```

**Change to:**
```typescript
const newSocket = io(API_URL || window.location.origin, {
  auth: { token: getAuthToken() },
  transports: ['websocket'],
});
```

**Why:** Socket.IO defaults to HTTP long-polling and then upgrades to WebSocket. This adds an unnecessary HTTP request/response cycle before the WebSocket connection is established. Forcing WebSocket-only skips the long-polling phase entirely, saving one full round-trip. Modern browsers all support WebSocket natively.

**Risk:** If a proxy or firewall blocks WebSocket connections, the client won't be able to fall back to long-polling. This is unlikely on Render.com but worth noting.

---

### Fix 2: Combine Auth DB Queries Into One

**File:** `server/middleware/auth.ts` - `validateSession` method (line 37)

**Current:** Two sequential queries:
1. SELECT to validate session (JOIN sessions + users)
2. UPDATE to set last_accessed_at

**Change to:** Single query using a CTE (Common Table Expression):
```typescript
async validateSession(token: string): Promise<SessionInfo | null> {
  try {
    const result = await this.pool.query(
      `WITH updated AS (
        UPDATE sessions SET last_accessed_at = NOW()
        WHERE token = $1 AND expires_at > NOW() AND revoked_at IS NULL
        RETURNING *
      )
      SELECT u.email, u.name, u.role, updated.*
      FROM updated
      JOIN users u ON updated.user_id = u.id`,
      [token]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const session = result.rows[0];
    return {
      userId: session.user_id,
      email: session.email,
      name: session.name,
      role: session.role,
      sessionId: session.id,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error validating session');
    return null;
  }
}
```

**Why:** Eliminates one full database round-trip. The CTE performs the UPDATE and SELECT in a single query execution, cutting the auth overhead roughly in half.

**Risk:** Minimal. The CTE approach is well-supported in PostgreSQL and semantically equivalent.

---

### Fix 3: Optimistically Enable Chat Input

**File:** `client/src/App.tsx`

Add a message queue that buffers messages sent while the socket is still connecting, then flushes them once connected.

**Changes:**

1. Add a `pendingMessages` ref and a `socketConnected` state:
```typescript
const [socketConnected, setSocketConnected] = useState(false);
const pendingMessagesRef = useRef<Array<{ sender: string; content: string }>>([]);
```

2. In the socket useEffect, track connection state and flush pending messages:
```typescript
useEffect(() => {
  const newSocket = io(API_URL || window.location.origin, {
    auth: { token: getAuthToken() },
    transports: ['websocket'],
  });
  setSocket(newSocket);

  newSocket.on('connect', () => {
    setSocketConnected(true);
    // Flush any messages queued while connecting
    while (pendingMessagesRef.current.length > 0) {
      const msg = pendingMessagesRef.current.shift();
      if (msg) newSocket.emit('message', msg);
    }
  });

  newSocket.on('disconnect', () => {
    setSocketConnected(false);
  });

  newSocket.on('message', (msg: ChatMessage) => {
    setMessages((prev) => [msg, ...prev]);
  });

  newSocket.on('activity', (activity: Activity) => {
    setActivities((prev) => [activity, ...prev].slice(0, 50));
  });

  return () => {
    newSocket.close();
  };
}, []);
```

3. Update `sendMessage` to queue if not yet connected:
```typescript
const sendMessage = (e: React.FormEvent) => {
  e.preventDefault();
  if (!inputMessage.trim()) return;

  const msg = { sender: 'Neil', content: inputMessage.trim() };

  if (socket?.connected) {
    shouldAutoScroll.current = true;
    socket.emit('message', msg);
  } else {
    // Queue message to send when connected
    pendingMessagesRef.current.push(msg);
  }

  setInputMessage('');
};
```

4. Enable the input immediately (remove `disabled` from input, keep it only on the button when there is no text):
```tsx
<input
  type="text"
  value={inputMessage}
  onChange={(e) => setInputMessage(e.target.value)}
  placeholder={socketConnected ? 'Type a message...' : 'Connecting...'}
/>
<button type="submit" disabled={!inputMessage.trim()}>
  Send
</button>
```

**Why:** The user can start typing immediately. Messages typed before the socket connects are queued and sent automatically once connected. This eliminates the perceived delay entirely.

**Risk:** If the socket fails to connect at all, queued messages would be lost. This is acceptable since the user would see the "Connecting..." placeholder and the header indicator already shows red when disconnected.

---

### Fix 4: Visual Connection Status Feedback

**File:** `client/src/App.tsx` and `client/src/App.css`

Instead of a mysteriously disabled input, show clear status:

1. The placeholder text already changes in Fix 3 above: `Connecting...` vs `Type a message...`

2. Add a subtle connecting indicator in the chat panel header:
```tsx
<h2>
  {'\u{1F4AC}'} Chat
  {!socketConnected && (
    <span className="chat-connecting"> connecting...</span>
  )}
</h2>
```

3. Add CSS for the connecting indicator:
```css
.chat-connecting {
  font-size: 0.75rem;
  color: #f59e0b;
  font-weight: normal;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

**Why:** Users get immediate visual feedback that the system is working on connecting, rather than wondering why the input is disabled.

---

## Summary of Changes

| File | Change |
|------|--------|
| `client/src/App.tsx` | Add `transports: ['websocket']`, add `socketConnected` state, add message queue, update input/button disabled logic, add connecting indicator |
| `client/src/App.css` | Add `.chat-connecting` styles |
| `server/middleware/auth.ts` | Combine `validateSession` into single CTE query |

## Testing

- Existing integration tests should still pass since the server-side change is functionally equivalent
- The Socket.IO auth middleware tests may need minor updates if they mock `validateSession`
- Manual testing: login, observe chat input is immediately typeable with "Connecting..." placeholder, then switches to "Type a message..." once connected
