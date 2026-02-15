#!/usr/bin/env npx ts-node
/**
 * MCP Server for Swissclaw Hub
 *
 * Exposes the Hub's REST API as MCP tools so AI agents can:
 * - Read/send chat messages
 * - Read/update server status
 * - Create/read/update/delete kanban tasks
 * - Add activity events
 *
 * Run: npx ts-node server/mcp-server.ts
 * Or via Claude Code MCP config (stdio transport).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE_URL = process.env.SWISSCLAW_HUB_URL || 'http://localhost:3001';
const SERVICE_TOKEN = process.env.SWISSCLAW_TOKEN || 'dev-token-change-in-production';
const AUTH_TOKEN = process.env.SWISSCLAW_AUTH_TOKEN || '';

// Helper: make authenticated API requests
async function api(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<unknown> {
  const { method = 'GET', body } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Use auth token for user-facing endpoints, service token for service endpoints
  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }
  if (path.includes('/service/')) {
    headers['X-Service-Token'] = SERVICE_TOKEN;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`);
  }

  return res.json();
}

// Create MCP server
const server = new McpServer({
  name: 'swissclaw-hub',
  version: '1.0.0',
});

// ─── Status ──────────────────────────────────────────────────────────────

server.tool(
  'get_status',
  'Get current server status, recent messages, and recent activities',
  {},
  async () => {
    const data = await api('/api/status');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ─── Chat Messages ───────────────────────────────────────────────────────

server.tool(
  'get_messages',
  'Get recent chat messages (last 50)',
  {},
  async () => {
    const data = await api('/api/messages');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'send_message',
  'Log a chat message as an activity event (creates activity record, broadcasts via Socket.io). Note: This creates an activity entry, not a direct chat message.',
  {
    content: z.string().describe('The message content to log'),
  },
  async ({ content }) => {
    // Use the service activities endpoint to log the message as an activity
    const data = await api('/api/service/activities', {
      method: 'POST',
      body: {
        type: 'chat',
        description: `Swissclaw: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
        metadata: { sender: 'Swissclaw', content },
      },
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ─── Kanban Board ────────────────────────────────────────────────────────

server.tool(
  'get_kanban',
  'Get the full kanban board — all columns and their tasks',
  {},
  async () => {
    const data = await api('/api/kanban');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'create_task',
  'Create a new kanban task in a specified column',
  {
    columnName: z.enum(['backlog', 'todo', 'inProgress', 'review', 'done', 'waiting-for-neil'])
      .describe('Column to place the task in'),
    title: z.string().max(200).describe('Task title'),
    description: z.string().optional().describe('Task description'),
    priority: z.enum(['low', 'medium', 'high']).default('medium').describe('Task priority'),
    assignedTo: z.string().optional().describe('Person assigned (e.g. neil, swissclaw)'),
    tags: z.array(z.string()).optional().describe('Tags for categorization'),
  },
  async (args) => {
    const data = await api('/api/kanban/tasks', { method: 'POST', body: args });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'update_task',
  'Update an existing kanban task — move columns, change title/priority/etc.',
  {
    id: z.number().describe('Task ID (numeric)'),
    columnName: z.enum(['backlog', 'todo', 'inProgress', 'review', 'done', 'waiting-for-neil'])
      .optional().describe('Move to this column'),
    title: z.string().max(200).optional().describe('New title'),
    description: z.string().optional().describe('New description'),
    priority: z.enum(['low', 'medium', 'high']).optional().describe('New priority'),
    assignedTo: z.string().optional().describe('New assignee'),
    tags: z.array(z.string()).optional().describe('New tags'),
  },
  async ({ id, ...updates }) => {
    const data = await api(`/api/kanban/tasks/${id}`, { method: 'PUT', body: updates });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  'delete_task',
  'Delete a kanban task by ID',
  {
    id: z.number().describe('Task ID to delete'),
  },
  async ({ id }) => {
    const data = await api(`/api/kanban/tasks/${id}`, { method: 'DELETE' });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ─── Activities ──────────────────────────────────────────────────────────

server.tool(
  'add_activity',
  'Add an activity event to the live activity feed (broadcasts via Socket.io)',
  {
    type: z.string().max(50).describe('Activity type (e.g. deployment, task, chat, system)'),
    description: z.string().max(500).describe('What happened'),
    metadata: z.record(z.string(), z.unknown()).optional().describe('Additional data'),
  },
  async (args) => {
    const data = await api('/api/service/activities', { method: 'POST', body: args });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ─── Activities ──────────────────────────────────────────────────────────

server.tool(
  'get_activities',
  'Get paginated activity history',
  {
    limit: z.number().optional().describe('Number of activities to return (default: 20, max: 100)'),
    before: z.string().optional().describe('Cursor for pagination (timestamp of oldest activity from previous page)'),
  },
  async ({ limit, before }) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (before) params.append('before', before);
    const queryString = params.toString();
    const data = await api(`/api/activities${queryString ? `?${queryString}` : ''}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ─── Model Usage ───────────────────────────────────────────────────────────

server.tool(
  'report_model_usage',
  'Report AI model token usage and estimated cost',
  {
    inputTokens: z.number().describe('Number of input tokens used'),
    outputTokens: z.number().describe('Number of output tokens used'),
    model: z.string().describe('Model name (e.g., claude-sonnet-4-20250514)'),
    estimatedCost: z.number().describe('Estimated cost in USD'),
  },
  async ({ inputTokens, outputTokens, model, estimatedCost }) => {
    const data = await api('/api/service/model-usage', {
      method: 'POST',
      body: { inputTokens, outputTokens, model, estimatedCost },
    });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ─── Build Info ──────────────────────────────────────────────────────────

server.tool(
  'get_build_info',
  'Get current build version and commit hash',
  {},
  async () => {
    const data = await api('/api/build');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

// ─── Start Server ────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
