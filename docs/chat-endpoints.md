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
- Updates `messages.processing_state`
- Broadcasts Socket.IO `message-state` event

Acknowledgment example:

```bash
curl -X PUT "https://swissclaw-hub.onrender.com/api/service/messages/123/state" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"state":"received"}'
```

### `GET /api/messages`

Get recent chat messages (up to 50).

### `GET /api/status`

Get dashboard status snapshot including `recentMessages`.

## Socket.IO Events

Incoming:
- `message`
- `message-state`

Outgoing (from client/service):
- `message`
