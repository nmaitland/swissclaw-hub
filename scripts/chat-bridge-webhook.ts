#!/usr/bin/env npx ts-node
/**
 * Chat Bridge Webhook - Connects Hub chat to OpenClaw via webhooks
 *
 * This script:
 * 1. Connects to Swissclaw Hub via Socket.io
 * 2. When a message arrives, POSTs to OpenClaw's webhook endpoint
 * 3. Can also send messages back to Hub (--send mode)
 *
 * Usage:
 *   npx ts-node scripts/chat-bridge-webhook.ts                    # Daemon mode
 *   npx ts-node scripts/chat-bridge-webhook.ts --send "Hello"     # Send a message
 *
 * Environment variables:
 *   SWISSCLAW_HUB_URL      - Hub URL (default: https://swissclaw.hydeabbey.net)
 *   SWISSCLAW_USERNAME     - Username for Hub login
 *   SWISSCLAW_PASSWORD     - Password for Hub login
 *   OPENCLAW_HOOKS_URL     - OpenClaw webhook URL (default: http://127.0.0.1:18789)
 *   OPENCLAW_HOOKS_TOKEN   - OpenClaw webhook token (or read from ~/.openclaw/credentials/hooks-token.txt)
 */

import { io, Socket } from 'socket.io-client';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Load .env file only if env vars aren't already set
import { config } from 'dotenv';
config({ override: false });

// Configuration
const HUB_TOKEN_FILE = path.join(os.homedir(), '.swissclaw-token');
const HOOKS_TOKEN_FILE = path.join(os.homedir(), '.openclaw/credentials/hooks-token.txt');
const HUB_URL = process.env.SWISSCLAW_HUB_URL || 'https://swissclaw.hydeabbey.net';
const OPENCLAW_URL = process.env.OPENCLAW_HOOKS_URL || 'http://127.0.0.1:18789';

// Message types
interface ChatMessage {
  id: number;
  sender: string;
  content: string;
  created_at: string;
}

interface LoginResponse {
  token?: string;
  success?: boolean;
  error?: string;
}

// Parse command line arguments
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
        showUsage();
        process.exit(0);
        break;
    }
  }

  return { mode, message, sender, forceLogin };
}

function showUsage(): void {
  console.log(`
Usage: npx ts-node scripts/chat-bridge-webhook.ts [OPTIONS]

Bridges Swissclaw Hub chat to OpenClaw via webhooks.

OPTIONS:
    --send "MESSAGE"      Send a message to Hub and exit
    --sender NAME         Set sender name (default: Swissclaw)
    --login               Force re-login to Hub
    --help                Show this help message

ENVIRONMENT VARIABLES:
    SWISSCLAW_HUB_URL      Hub URL (default: https://swissclaw.hydeabbey.net)
    SWISSCLAW_USERNAME     Username for Hub login
    SWISSCLAW_PASSWORD     Password for Hub login
    OPENCLAW_HOOKS_URL     OpenClaw URL (default: http://127.0.0.1:18789)
    OPENCLAW_HOOKS_TOKEN   OpenClaw webhook token

EXAMPLES:
    # Run as daemon (listens for messages, forwards to OpenClaw)
    npx ts-node scripts/chat-bridge-webhook.ts

    # Send a reply back to Hub
    npx ts-node scripts/chat-bridge-webhook.ts --send "Hello from Swissclaw!"

TOKEN STORAGE:
    Hub token: ${HUB_TOKEN_FILE}
    Hooks token: ${HOOKS_TOKEN_FILE}
`);
}

// Load Hub token
function loadHubToken(): string | null {
  try {
    if (fs.existsSync(HUB_TOKEN_FILE)) {
      return fs.readFileSync(HUB_TOKEN_FILE, 'utf-8').trim() || null;
    }
  } catch { /* ignore */ }
  return null;
}

// Save Hub token
function saveHubToken(token: string): void {
  try {
    fs.writeFileSync(HUB_TOKEN_FILE, token, { mode: 0o600 });
    console.error(`Hub token saved to ${HUB_TOKEN_FILE}`);
  } catch (err) {
    console.error('Warning: Could not save Hub token:', err);
  }
}

// Clear Hub token
function clearHubToken(): void {
  try {
    if (fs.existsSync(HUB_TOKEN_FILE)) fs.unlinkSync(HUB_TOKEN_FILE);
  } catch { /* ignore */ }
}

// Load OpenClaw hooks token
function loadHooksToken(): string {
  // First try env var
  if (process.env.OPENCLAW_HOOKS_TOKEN) {
    return process.env.OPENCLAW_HOOKS_TOKEN;
  }
  // Then try file
  try {
    if (fs.existsSync(HOOKS_TOKEN_FILE)) {
      return fs.readFileSync(HOOKS_TOKEN_FILE, 'utf-8').trim();
    }
  } catch { /* ignore */ }
  throw new Error(`OpenClaw hooks token not found. Set OPENCLAW_HOOKS_TOKEN or create ${HOOKS_TOKEN_FILE}`);
}

// Validate Hub token
async function validateHubToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${HUB_URL}/api/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

// Login to Hub
async function loginToHub(): Promise<string> {
  const username = process.env.SWISSCLAW_USERNAME;
  const password = process.env.SWISSCLAW_PASSWORD;

  if (!username || !password) {
    throw new Error(
      'SWISSCLAW_USERNAME and SWISSCLAW_PASSWORD must be set.\n' +
      'Export them before running:\n' +
      '  export SWISSCLAW_USERNAME=admin\n' +
      '  export SWISSCLAW_PASSWORD=yourpassword'
    );
  }

  console.error(`Logging in to Hub at ${HUB_URL}...`);

  const response = await fetch(`${HUB_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = (await response.json()) as LoginResponse;

  if (!response.ok || !data.token) {
    throw new Error(`Hub login failed: ${data.error || `HTTP ${response.status}`}`);
  }

  saveHubToken(data.token);
  console.error('Hub login successful!');
  return data.token;
}

// Ensure we have a valid Hub token
async function ensureHubAuth(forceLogin: boolean): Promise<string> {
  if (forceLogin) clearHubToken();

  const existingToken = loadHubToken();
  if (existingToken) {
    console.error('Found existing Hub token, validating...');
    if (await validateHubToken(existingToken)) {
      console.error('Hub token is valid');
      return existingToken;
    }
    console.error('Hub token expired');
    clearHubToken();
  }

  return loginToHub();
}

// Forward message to OpenClaw webhook
async function forwardToOpenClaw(msg: ChatMessage, hooksToken: string): Promise<void> {
  const payload = {
    message: `[Hub Chat] ${msg.sender}: ${msg.content}

📤 TO REPLY TO HUB CHAT: You MUST run this exact command:
export PATH="$HOME/.bun/bin:$HOME/.npm-global/bin:$PATH" && \
cd ~/.openclaw/workspace && \
bash scripts/chat-reply.sh "Your response here"

This sends your response back to ${msg.sender} in the Hub chat.`,
    name: 'HubChat',
    deliver: false,  // We'll handle reply ourselves
  };

  console.error(`[${new Date().toISOString()}] Forwarding to OpenClaw: ${msg.sender}: ${msg.content.substring(0, 50)}...`);

  try {
    const response = await fetch(`${OPENCLAW_URL}/hooks/agent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hooksToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`OpenClaw webhook error: ${response.status} ${text}`);
    } else {
      console.error(`OpenClaw webhook accepted (${response.status})`);
    }
  } catch (err) {
    console.error('OpenClaw webhook failed:', err instanceof Error ? err.message : String(err));
  }
}

// Daemon mode - listen for messages and forward to OpenClaw
async function daemonMode(hubToken: string, hooksToken: string): Promise<void> {
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
    // Skip messages from the agent (ourselves)
    if (msg.sender === 'Swissclaw' || msg.sender === 'Agent') {
      return;
    }

    console.error(`[${new Date().toISOString()}] Received: [${msg.sender}] ${msg.content}`);
    await forwardToOpenClaw(msg, hooksToken);
  });

  socket.on('error', (err: Error) => {
    console.error(`[${new Date().toISOString()}] Socket error:`, err.message);
  });

  // Keep running until interrupted
  return new Promise((resolve) => {
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

// Send mode - send a message to Hub
async function sendMode(hubToken: string, content: string, sender: string): Promise<void> {
  const socket: Socket = io(HUB_URL, {
    auth: { token: hubToken },
    transports: ['websocket', 'polling'],
    timeout: 5000,
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      console.error(`Connected to Hub, sending message as ${sender}...`);
      socket.emit('message', { sender, content });
      // Wait longer for message to actually transmit
      setTimeout(() => {
        socket.disconnect();
        console.error('✅ Message sent to Hub successfully');
        resolve();
      }, 2000);
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      console.error('❌ Socket.io connection error:', err.message);
      reject(new Error(`Socket connection failed: ${err.message}`));
    });

    socket.on('error', (err: Error) => {
      clearTimeout(timeout);
      console.error('❌ Socket error:', err.message);
      reject(err);
    });
  });
}

// Main
async function main(): Promise<void> {
  const { mode, message, sender, forceLogin } = parseArgs();

  try {
    const hubToken = await ensureHubAuth(forceLogin);

    switch (mode) {
      case 'daemon':
        const hooksToken = loadHooksToken();
        await daemonMode(hubToken, hooksToken);
        break;
      case 'send':
        if (!message) {
          throw new Error('No message provided. Use --send "your message"');
        }
        await sendMode(hubToken, message, sender);
        break;
    }
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
