# MCP Server — How To

The Swissclaw Hub includes an MCP (Model Context Protocol) server that lets AI agents interact with the Hub's REST API. It uses stdio transport and exposes 9 tools for managing chat, kanban tasks, activities, and server status.

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
        "SWISSCLAW_TOKEN": "dev-token-change-in-production"
      }
    }
  }
}
```

When you open this project in Claude Code, the MCP server is automatically available. You can invoke tools like `get_kanban` or `send_message` from the Claude Code conversation.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SWISSCLAW_HUB_URL` | `http://localhost:3001` | Base URL of the running Hub server |
| `SWISSCLAW_TOKEN` | `dev-token-change-in-production` | Service token for `/api/service/*` endpoints |
| `SWISSCLAW_AUTH_TOKEN` | _(empty)_ | Optional Bearer token for user-facing endpoints |

The Hub server must be running for MCP tools to work. The MCP server calls the Hub's REST API over HTTP.

### Authentication

The MCP server uses two auth mechanisms depending on the endpoint:

- **Bearer token** (`SWISSCLAW_AUTH_TOKEN`): Used for user-facing endpoints like `/api/status`, `/api/messages`, `/api/kanban`. Set this to a valid session token if the Hub requires authentication.
- **Service token** (`SWISSCLAW_TOKEN`): Used for service-to-service endpoints like `/api/service/activities`. Sent as `X-Service-Token` header.

For local development, the Hub accepts unauthenticated requests on most endpoints, so you can leave `SWISSCLAW_AUTH_TOKEN` empty.

## Available Tools

### Status

| Tool | Description |
|------|-------------|
| `get_status` | Returns server status, recent chat messages, and recent activities |

### Chat

| Tool | Parameters | Description |
|------|-----------|-------------|
| `get_messages` | _(none)_ | Returns the last 50 chat messages |
| `send_message` | `content` (string) | Sends a chat message as Swissclaw. Broadcasts via Socket.io and logs an activity |

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

Common activity types: `deployment`, `task`, `chat`, `system`

### Build Info

| Tool | Description |
|------|-------------|
| `get_build_info` | Returns the current build version and git commit hash |

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

**MCP server not appearing in Claude Code** — Check that `.mcp.json` exists at the project root and that `npx ts-node` is available. Restart Claude Code after adding the config.

## Architecture

```
Claude Code / AI Agent
        │
        │ stdio (JSON-RPC)
        ▼
   MCP Server (server/mcp-server.ts)
        │
        │ HTTP (fetch)
        ▼
   Hub REST API (server/index.ts)
        │
        │ SQL
        ▼
   PostgreSQL
```

The MCP server is a thin adapter layer — it translates MCP tool calls into HTTP requests to the Hub's existing REST API. It doesn't access the database directly.
