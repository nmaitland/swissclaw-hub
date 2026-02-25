# Chat Endpoints

Base URL: `https://swissclaw-hub.onrender.com`

## Authentication

Service chat endpoints require:

`Authorization: Bearer <session-token>`

## Endpoints

### `POST /api/service/messages`

Send a chat message.

Request body:

```json
{
  "sender": "Swissclaw",
  "content": "Hello"
}
```

Behavior:
- Stores the message in the `messages` table
- Broadcasts Socket.IO `message` event
- Creates a chat activity entry

### `PUT /api/service/messages/:id/state`

Update/acknowledge a message processing state.

Allowed `state` values:
- `received`
- `processing`
- `thinking`
- `responded`

Request body:

```json
{
  "state": "received"
}
```

Behavior:
- For `state=received`, performs an atomic claim (`NULL -> received`) so only one worker gets `claimed=true`
- Returns `claimed=false` if another worker already claimed the same message
- Broadcasts Socket.IO `message-state` only when a real state transition occurs

Acknowledgment example:

```bash
curl -X PUT "https://swissclaw-hub.onrender.com/api/service/messages/123/state" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"state":"received"}'
```

Example response:

```json
{
  "id": 123,
  "state": "received",
  "updatedAt": "2026-02-25T20:15:00.123Z",
  "claimed": true
}
```

### `GET /api/messages`

Get recent chat messages (up to 50).

### `GET /api/status`

Get compact status snapshot (`state`, `currentTask`, `lastActive`, daily chat/activity counts, latest model usage snapshot).

## Socket.IO Events

Incoming:
- `message`
- `message-state`

Outgoing (from client/service):
- `message`
