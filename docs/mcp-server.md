# MCP Server — How To

The Swissclaw Hub includes an MCP (Model Context Protocol) server that lets AI agents interact with the Hub's REST API. It uses stdio transport and exposes tools for managing chat, kanban tasks, activities, model usage, and server status.

## Quick Start

```bash
# Run the MCP server directly
npm run mcp

# Or via ts-node
npx ts-node server/mcp-server.ts
```

The server communicates over stdin/stdout (stdio transport), so it's designed to be launched by an MCP client (like Claude Code), not run interactively.

## Claude Code Integration

The project includes a `.mcp.json` file that configures the MCP server for Claude Code:

```json
{
  "mcpServers": {
    "swissclaw-hub": {
      "command": "npx",
      "args": ["ts-node", "server/mcp-server.ts"],
      "env": {
        "SWISSCLAW_HUB_URL": "http://localhost:3001",
        "SWISSCLAW_TOKEN": "dev-token-change-in-production",
        "SWISSCLAW_AUTH_TOKEN": "your-session-token-here"
      }
    }
  }
}
```

When you open this project in Claude Code, the MCP server is automatically available. You can invoke tools like `get_kanban` or `send_message` from the Claude Code conversation.

**Note:** For real-time chat features, you must set `SWISSCLAW_AUTH_TOKEN` to a valid session token.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SWISSCLAW_HUB_URL` | `http://localhost:3001` | Base URL of the running Hub server |
| `SWISSCLAW_TOKEN` | `dev-token-change-in-production` | Service token for `/api/service/*` endpoints |
| `SWISSCLAW_AUTH_TOKEN` | _(empty)_ | **Required for chat.** Bearer token for Socket.io connection and user-facing endpoints |

The Hub server must be running for MCP tools to work. The MCP server calls the Hub's REST API over HTTP and maintains a Socket.io connection for real-time chat.

### Authentication

The MCP server uses two auth mechanisms depending on the endpoint:

- **Bearer token** (`SWISSCLAW_AUTH_TOKEN`): Used for user-facing endpoints like `/api/status`, `/api/messages`, `/api/kanban` and for the Socket.io connection. Set this to a valid session token.
- **Service token** (`SWISSCLAW_TOKEN`): Used for service-to-service endpoints like `/api/service/activities`. Sent as `X-Service-Token` header.

For local development, you can get a session token by logging in via the Hub UI and copying the token from localStorage, or by using the `/api/login` endpoint.

## Available Tools

### Status

| Tool | Description |
|------|-------------|
| `get_status` | Returns server status, recent chat messages, and recent activities |

### Chat

| Tool | Parameters | Description |
|------|-----------|-------------|
| `get_messages` | _(none)_ | Returns the last 50 chat messages (one-time fetch) |
| `chat_listen` | `since?` (ISO timestamp) | **Real-time chat.** Returns buffered messages received since last call. Call this in a loop to receive messages as they arrive. Requires `SWISSCLAW_AUTH_TOKEN`. |
| `send_message` | `content` (string), `sender?` (string) | Sends a chat message that appears in the Hub's chat window. Uses Socket.io if connected, falls back to REST API. |

**Chat Bridge Usage:**

To have your AI agent participate in real-time chat through the Hub:

1. Set `SWISSCLAW_AUTH_TOKEN` to a valid session token
2. The MCP server will automatically connect to the Hub via Socket.io
3. Call `chat_listen` in a loop to receive new messages
4. Call `send_message` to respond

Example agent loop:
```
while (true) {
  const { messages } = await chat_listen();
  for (const msg of messages) {
    if (msg.sender !== 'Swissclaw') {
      const response = await processMessage(msg);
      await send_message({ content: response });
    }
  }
  await sleep(1000); // Small delay between polls
}
```

### Kanban Board

| Tool | Parameters | Description |
|------|-----------|-------------|
| `get_kanban` | _(none)_ | Returns all columns and their tasks |
| `create_task` | `columnName`, `title`, `description?`, `priority?`, `assignedTo?`, `tags?` | Creates a new task in the specified column |
| `update_task` | `id`, `columnName?`, `title?`, `description?`, `priority?`, `assignedTo?`, `tags?` | Updates an existing task (move columns, edit fields) |
| `delete_task` | `id` | Deletes a task by numeric ID |

**Column names:** `backlog`, `todo`, `inProgress`, `review`, `done`, `waiting-for-neil`

**Priority values:** `low`, `medium`, `high`

### Activities

| Tool | Parameters | Description |
|------|-----------|-------------|
| `add_activity` | `type`, `description`, `metadata?` | Adds an activity event to the live feed. Broadcasts via Socket.io |
| `get_activities` | `limit?`, `before?` | Get paginated activity history (cursor-based pagination) |

Common activity types: `deployment`, `task`, `chat`, `system`

**Pagination:** Use `limit` to control page size (default: 20, max: 100). Use `before` (timestamp cursor) to fetch older activities.

### Model Usage

| Tool | Parameters | Description |
|------|-----------|-------------|
| `report_model_usage` | `inputTokens`, `outputTokens`, `model`, `estimatedCost` | Report AI model token usage and estimated cost |

### Build Info

| Tool | Description |
|------|-------------|
| `get_build_info` | Returns the current build date and git commit hash |

## Example Usage

Once the MCP server is connected in Claude Code, you can ask things like:

- "Check the kanban board for any high-priority tasks"
- "Create a task in the todo column: Fix login page styling"
- "Send a message to Neil: deployment complete"
- "What's the current server status?"
- "Move task 42 to the done column"
- "Add a deployment activity for v2.2.0 release"

## Troubleshooting

**"API ... failed (401)"** — The Hub requires authentication. Set `SWISSCLAW_AUTH_TOKEN` to a valid session token, or ensure the Hub is running in development mode.

**"fetch failed" / connection refused** — The Hub server isn't running. Start it with `npm run dev` or `npm run server:dev`.

**"Socket.io not connected"** — `SWISSCLAW_AUTH_TOKEN` is not set or invalid. The MCP server needs a valid session token to connect via Socket.io for real-time chat.

**MCP server not appearing in Claude Code** — Check that `.mcp.json` exists at the project root and that `npx ts-node` is available. Restart Claude Code after adding the config.

## Architecture

```
Claude Code / AI Agent
        │
        │ stdio (JSON-RPC)
        ▼
   MCP Server (server/mcp-server.ts)
        │
        ├─── HTTP (fetch) ───► Hub REST API
        │
        └─── Socket.io ─────► Hub Real-time
        ▲                          │
        │                          ▼
   Buffered Messages ◄────── Broadcast
```

The MCP server is a thin adapter layer — it translates MCP tool calls into HTTP requests to the Hub's existing REST API. For real-time chat, it maintains a persistent Socket.io connection that buffers incoming messages for the `chat_listen` tool.

### Chat Bridge Flow

1. **Connection:** MCP server connects to Hub via Socket.io using `SWISSCLAW_AUTH_TOKEN`
2. **Incoming:** Hub broadcasts messages via Socket.io → MCP server buffers them
3. **Polling:** Agent calls `chat_listen` → receives buffered messages
4. **Outgoing:** Agent calls `send_message` → MCP emits via Socket.io → Hub broadcasts to all clients

This design allows agents behind firewalls to participate in real-time chat without requiring inbound connections.
