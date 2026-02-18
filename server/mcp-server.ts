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
import { io, Socket } from 'socket.io-client';
import { z } from 'zod';

const BASE_URL = process.env.SWISSCLAW_HUB_URL || 'http://localhost:3001';
const SERVICE_TOKEN = process.env.SWISSCLAW_TOKEN || 'dev-token-change-in-production';
const AUTH_TOKEN = process.env.SWISSCLAW_AUTH_TOKEN || '';

// Message buffer for chat_listen
interface BufferedMessage {
  id: number;
  sender: string;
  content: string;
  created_at: string;
  received_at: string;
}

const MAX_BUFFER_SIZE = 100;
let messageBuffer: BufferedMessage[] = [];
let socketClient: Socket | null = null;
let isSocketConnected = false;

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

// Initialize Socket.io client for real-time chat
function initSocketClient(): void {
  if (!AUTH_TOKEN) {
    console.error('SWISSCLAW_AUTH_TOKEN not set. Socket.io client cannot connect.');
    return;
  }

  socketClient = io(BASE_URL, {
    auth: { token: AUTH_TOKEN },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socketClient.on('connect', () => {
    isSocketConnected = true;
    console.error('Socket.io connected to Hub');
  });

  socketClient.on('disconnect', () => {
    isSocketConnected = false;
    console.error('Socket.io disconnected from Hub');
  });

  socketClient.on('message', (msg: BufferedMessage) => {
    // Buffer the message
    const bufferedMsg: BufferedMessage = {
      ...msg,
      received_at: new Date().toISOString(),
    };
    messageBuffer.push(bufferedMsg);

    // Keep buffer size under control (FIFO)
    if (messageBuffer.length > MAX_BUFFER_SIZE) {
      messageBuffer = messageBuffer.slice(-MAX_BUFFER_SIZE);
    }
  });

  socketClient.on('error', (err: Error) => {
    console.error('Socket.io error:', err);
  });
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

server.tool(
  'update_status',
  'Update the server status panel (state and current task)',
  {
    state: z.enum(['active', 'busy', 'idle']).describe('Current state of the Swissclaw agent'),
    currentTask: z.string().describe('Description of what the agent is currently doing'),
  },
  async ({ state, currentTask }) => {
    const data = await api('/api/service/status', {
      method: 'PUT',
      body: { state, currentTask },
    });
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
  'chat_listen',
  'Listen for new chat messages from the Hub. Returns buffered messages received since last call. Call this in a loop to receive messages in real-time.',
  {
    since: z.string().optional().describe('ISO timestamp to filter messages (returns messages received after this time)'),
  },
  async ({ since }) => {
    if (!isSocketConnected) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: 'Socket.io not connected. Check SWISSCLAW_AUTH_TOKEN is set and Hub is running.' }) }],
      };
    }

    // Filter messages by timestamp if provided
    let messages = messageBuffer;
    if (since) {
      const sinceDate = new Date(since);
      messages = messageBuffer.filter((msg) => new Date(msg.received_at) > sinceDate);
    }

    // Clear the buffer (messages are consumed)
    const result = [...messages];
    messageBuffer = [];

    return {
      content: [{ type: 'text', text: JSON.stringify({ messages: result, count: result.length }) }],
    };
  }
);

server.tool(
  'send_message',
  'Send a chat message to the Hub chat window. The message will appear in the chat UI and be broadcast to all connected clients.',
  {
    content: z.string().describe('The message content to send'),
    sender: z.string().optional().describe('Sender name (default: Swissclaw)'),
  },
  async ({ content, sender = 'Swissclaw' }) => {
    // Try Socket.io first (real-time)
    if (isSocketConnected && socketClient) {
      return new Promise((resolve) => {
        socketClient!.emit('message', { sender, content }, (_ack: unknown) => {
          resolve({
            content: [{ type: 'text', text: JSON.stringify({ success: true, sent_via: 'socket.io', sender, content }) }],
          });
        });

        // Timeout fallback if no acknowledgment
        setTimeout(() => {
          resolve({
            content: [{ type: 'text', text: JSON.stringify({ success: true, sent_via: 'socket.io', sender, content, note: 'No acknowledgment received' }) }],
          });
        }, 2000);
      });
    }

    // Fallback to REST API if Socket.io not connected
    try {
      const data = await api('/api/service/messages', {
        method: 'POST',
        body: { sender, content },
      });
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch {
      // Final fallback: create activity (old behavior)
      const data = await api('/api/service/activities', {
        method: 'POST',
        body: {
          type: 'chat',
          description: `${sender}: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
          metadata: { sender, content },
        },
      });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            activity: data,
            note: 'Socket.io not connected, message sent as activity instead of chat message',
          }),
        }],
      };
    }
  }
);

server.tool(
  'update_message_state',
  'Update the processing state of a chat message (received, processing, thinking, responded)',
  {
    messageId: z.string().describe('The message ID to update'),
    state: z.enum(['received', 'processing', 'thinking', 'responded']).describe('The new processing state'),
  },
  async ({ messageId, state }) => {
    const data = await api(`/api/service/messages/${messageId}/state`, {
      method: 'PUT',
      body: { state },
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
  // Initialize Socket.io client before starting MCP server
  initSocketClient();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
