#!/usr/bin/env npx ts-node
/**
 * Chat Bridge Webhook - Connects Hub chat to OpenClaw via webhooks
 *
 * Responsibilities:
 * 1. Listen on Swissclaw Hub Socket.io chat stream.
 * 2. Forward inbound human messages to OpenClaw webhook.
 * 3. Keep --send compatibility by delegating chat send via shared Hub API client.
 */

import { io, Socket } from 'socket.io-client';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from 'dotenv';
import { ensureHubAuth, HUB_URL } from './lib/hub-auth';
import { HubApiClient } from './lib/hub-api-client';

config({ override: false });

const HOOKS_TOKEN_FILE = path.join(os.homedir(), '.openclaw/credentials/hooks-token.txt');
const OPENCLAW_URL = process.env.OPENCLAW_HOOKS_URL || 'http://127.0.0.1:18789';

interface ChatMessage {
  id: number;
  sender: string;
  content: string;
  created_at: string;
}

function parseArgs(): { mode: 'daemon' | 'send'; message: string; sender: string; forceLogin: boolean } {
  const args = process.argv.slice(2);
  let mode: 'daemon' | 'send' = 'daemon';
  let message = '';
  let sender = 'Swissclaw';
  let forceLogin = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--send':
        mode = 'send';
        message = args[++i] || '';
        break;
      case '--sender':
        sender = args[++i] || 'Swissclaw';
        break;
      case '--login':
        forceLogin = true;
        break;
      case '--help':
        console.log(`
Usage: npx ts-node scripts/chat-bridge-webhook.ts [OPTIONS]

OPTIONS:
    --send "MESSAGE"      Send a message to Hub and exit
    --sender NAME         Set sender name (default: Swissclaw)
    --login               Force re-login to Hub
    --help                Show this help
`);
        process.exit(0);
        break;
    }
  }

  return { mode, message, sender, forceLogin };
}

function loadHooksToken(): string {
  if (process.env.OPENCLAW_HOOKS_TOKEN) {
    return process.env.OPENCLAW_HOOKS_TOKEN;
  }
  if (fs.existsSync(HOOKS_TOKEN_FILE)) {
    return fs.readFileSync(HOOKS_TOKEN_FILE, 'utf-8').trim();
  }
  throw new Error(`OpenClaw hooks token not found. Set OPENCLAW_HOOKS_TOKEN or create ${HOOKS_TOKEN_FILE}`);
}

async function fetchRecentChatHistory(client: HubApiClient, limit = 15): Promise<ChatMessage[]> {
  try {
    const result = await client.request(`/api/messages?limit=${Math.max(limit, 1)}`) as ChatMessage[];
    return [...result].reverse();
  } catch (error) {
    console.error('Failed to fetch recent chat history:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

function formatChatHistory(messages: ChatMessage[], currentMsgId: number): string {
  const history = messages
    .filter((message) => message.id !== currentMsgId)
    .map((message) => {
      const time = new Date(message.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      return `[${time}] ${message.sender}: ${message.content}`;
    })
    .join('\n');

  return history || '(no recent messages)';
}

async function forwardToOpenClaw(
  msg: ChatMessage,
  hooksToken: string,
  client: HubApiClient
): Promise<void> {
  const recentMessages = await fetchRecentChatHistory(client, 15);
  const chatHistory = formatChatHistory(recentMessages, msg.id);
  const payload = {
    message: `[Hub Chat] ${msg.sender}: ${msg.content}

--- RECENT CHAT HISTORY (for context) ---
${chatHistory}
--- END HISTORY ---

📤 TO REPLY TO HUB CHAT: You MUST run this exact command:
export PATH="$HOME/.bun/bin:$HOME/.npm-global/bin:$PATH" && \
cd ~/.openclaw/workspace && \
bash scripts/chat-reply.sh "Your response here"

This sends your response back to ${msg.sender} in the Hub chat.`,
    name: 'HubChat',
    deliver: false,
  };

  const response = await fetch(`${OPENCLAW_URL}/hooks/agent`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${hooksToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenClaw webhook error: ${response.status} ${text}`);
  }
}

async function daemonMode(hubToken: string, hooksToken: string, client: HubApiClient): Promise<void> {
  const socket: Socket = io(HUB_URL, {
    auth: { token: hubToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
  });

  console.error('Starting chat bridge daemon...');
  console.error(`Hub: ${HUB_URL}`);
  console.error(`OpenClaw: ${OPENCLAW_URL}/hooks/agent`);
  console.error('Press Ctrl+C to stop\n');

  socket.on('connect', () => {
    console.error(`[${new Date().toISOString()}] Connected to Hub`);
  });

  socket.on('disconnect', () => {
    console.error(`[${new Date().toISOString()}] Disconnected from Hub, reconnecting...`);
  });

  socket.on('message', async (msg: ChatMessage) => {
    if (msg.sender === 'Swissclaw' || msg.sender === 'Agent') {
      return;
    }

    try {
      await client.request(`/api/service/messages/${msg.id}/state`, {
        method: 'PUT',
        body: { state: 'received' },
      });
      await forwardToOpenClaw(msg, hooksToken, client);
      console.error(`[${new Date().toISOString()}] Forwarded message ${msg.id} from ${msg.sender}`);
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] Failed handling inbound message ${msg.id}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  });

  socket.on('error', (err: Error) => {
    console.error(`[${new Date().toISOString()}] Socket error:`, err.message);
  });

  await new Promise<void>((resolve) => {
    process.on('SIGINT', () => {
      console.error('\nShutting down...');
      socket.disconnect();
      resolve();
    });
    process.on('SIGTERM', () => {
      console.error('\nTerminated...');
      socket.disconnect();
      resolve();
    });
  });
}

async function sendMode(client: HubApiClient, content: string, sender: string): Promise<void> {
  await client.request('/api/service/messages', {
    method: 'POST',
    body: { sender, content },
  });
  console.error('Message sent to Hub successfully');
}

async function main(): Promise<void> {
  const { mode, message, sender, forceLogin } = parseArgs();
  try {
    const hubToken = await ensureHubAuth(forceLogin);
    const client = await HubApiClient.create(false);

    if (mode === 'daemon') {
      const hooksToken = loadHooksToken();
      await daemonMode(hubToken, hooksToken, client);
      return;
    }

    if (!message) {
      throw new Error('No message provided. Use --send "your message"');
    }
    await sendMode(client, message, sender);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
