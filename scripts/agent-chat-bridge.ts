#!/usr/bin/env npx ts-node
/**
 * Agent Chat Bridge - Event-driven Socket.io client for Swissclaw Hub
 *
 * This script connects to the Hub via Socket.io and provides real-time
 * bidirectional chat. It handles authentication, token persistence, and
 * outputs messages as JSON lines for easy piping to other processes.
 *
 * Usage:
 *   npx ts-node scripts/agent-chat-bridge.ts                    # Interactive mode
 *   npx ts-node scripts/agent-chat-bridge.ts --daemon         # Output messages as JSON lines
 *   npx ts-node scripts/agent-chat-bridge.ts --send "Hello"   # Send one message
 *   npx ts-node scripts/agent-chat-bridge.ts --login          # Force re-login
 *
 * Environment variables:
 *   SWISSCLAW_HUB_URL    - Hub URL (default: https://swissclaw.hydeabbey.net)
 *   SWISSCLAW_USERNAME   - Username for login
 *   SWISSCLAW_PASSWORD   - Password for login
 *   SWISSCLAW_TOKEN      - Service token for sending messages
 */

import { io, Socket } from 'socket.io-client';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

// Load .env file only if env vars aren't already set (don't overwrite existing env vars)
import { config } from 'dotenv';
config({ override: false });

// Configuration
const TOKEN_FILE = path.join(os.homedir(), '.swissclaw-token');
const HUB_URL = process.env.SWISSCLAW_HUB_URL || 'https://swissclaw.hydeabbey.net';

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
function parseArgs(): { mode: 'interactive' | 'daemon' | 'send'; message: string; sender: string; forceLogin: boolean } {
  const args = process.argv.slice(2);
  let mode: 'interactive' | 'daemon' | 'send' = 'interactive';
  let message = '';
  let sender = 'Agent';
  let forceLogin = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--daemon':
        mode = 'daemon';
        break;
      case '--send':
        mode = 'send';
        message = args[++i] || '';
        break;
      case '--sender':
        sender = args[++i] || 'Agent';
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
Usage: npx ts-node scripts/agent-chat-bridge.ts [OPTIONS]

Connects a local AI agent to Swissclaw Hub chat via Socket.io (event-driven).

OPTIONS:
    --daemon              Run continuously, outputting new messages as JSON lines
    --send "MESSAGE"      Send a message and exit
    --sender NAME         Set sender name (default: Agent)
    --login               Force re-login
    --help                Show this help message

ENVIRONMENT VARIABLES:
    SWISSCLAW_HUB_URL     Hub URL (default: https://swissclaw.hydeabbey.net)
    SWISSCLAW_USERNAME    Username for login
    SWISSCLAW_PASSWORD    Password for login
    SWISSCLAW_TOKEN       Service token for sending messages

EXAMPLES:
    # Interactive chat mode
    npx ts-node scripts/agent-chat-bridge.ts

    # Daemon mode (output messages as JSON lines for piping)
    npx ts-node scripts/agent-chat-bridge.ts --daemon

    # Send a message
    npx ts-node scripts/agent-chat-bridge.ts --send "Hello from my agent" --sender "MyBot"

    # Force re-login
    npx ts-node scripts/agent-chat-bridge.ts --login --daemon

TOKEN STORAGE:
    Auth tokens are stored in: ${TOKEN_FILE}
    (permissions: 600)
`);
}

// Load existing token
function loadToken(): string | null {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const token = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
      return token || null;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

// Save token to file
function saveToken(token: string): void {
  try {
    fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
    console.error(`Token saved to ${TOKEN_FILE}`);
  } catch (err) {
    console.error('Warning: Could not save token:', err);
  }
}

// Delete token file
function clearToken(): void {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
    }
  } catch {
    // Ignore errors
  }
}

// Validate token by making a request
async function validateToken(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${HUB_URL}/api/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

// Login and get token
async function login(): Promise<string> {
  const username = process.env.SWISSCLAW_USERNAME;
  const password = process.env.SWISSCLAW_PASSWORD;

  // Debug: show what env vars are set (mask password)
  console.error('Debug: SWISSCLAW_USERNAME =', username || '(not set)');
  console.error('Debug: SWISSCLAW_PASSWORD =', password ? '(set, length: ' + password.length + ')' : '(not set)');
  console.error('Debug: SWISSCLAW_HUB_URL =', process.env.SWISSCLAW_HUB_URL || '(using default)');

  if (!username || !password) {
    throw new Error(
      'SWISSCLAW_USERNAME and SWISSCLAW_PASSWORD environment variables must be set for login.\n' +
      'Set them before running the script:\n' +
      '  export SWISSCLAW_USERNAME=admin\n' +
      '  export SWISSCLAW_PASSWORD=yourpassword\n' +
      'Then run: npx ts-node scripts/agent-chat-bridge.ts'
    );
  }

  console.error(`Logging in to ${HUB_URL}...`);

  const response = await fetch(`${HUB_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = (await response.json()) as LoginResponse;

  if (!response.ok || !data.token) {
    throw new Error(`Login failed: ${data.error || `HTTP ${response.status}`}`);
  }

  saveToken(data.token);
  console.error('Login successful!');
  return data.token;
}

// Ensure we have a valid token
async function ensureAuth(forceLogin: boolean): Promise<string> {
  if (forceLogin) {
    clearToken();
  }

  const existingToken = loadToken();
  if (existingToken) {
    console.error('Found existing token, validating...');
    if (await validateToken(existingToken)) {
      console.error('Token is valid');
      return existingToken;
    }
    console.error('Token is invalid or expired');
    clearToken();
  }

  console.error('Please log in');
  return login();
}

// Interactive mode - two-way chat
async function interactiveMode(token: string): Promise<void> {
  const socket: Socket = io(HUB_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let connected = false;

  socket.on('connect', () => {
    connected = true;
    console.error('Connected to Hub. Type messages and press Enter to send.');
    console.error('Press Ctrl+C to exit.\n');
  });

  socket.on('disconnect', () => {
    connected = false;
    console.error('Disconnected from Hub');
  });

  socket.on('message', (msg: ChatMessage) => {
    // Don't echo our own messages
    if (msg.sender !== 'Agent') {
      console.log(`\n[${msg.sender}]: ${msg.content}`);
      rl.prompt();
    }
  });

  socket.on('error', (err: Error) => {
    console.error('Socket error:', err.message);
  });

  // Wait for connection
  await new Promise<void>((resolve) => {
    socket.once('connect', resolve);
    setTimeout(resolve, 5000); // Timeout after 5s
  });

  if (!connected) {
    throw new Error('Failed to connect to Hub');
  }

  // Read input loop
  rl.setPrompt('> ');
  rl.prompt();

  rl.on('line', (line) => {
    const content = line.trim();
    if (content) {
      socket.emit('message', { sender: 'Agent', content });
    }
    rl.prompt();
  });

  // Handle exit
  return new Promise((resolve) => {
    rl.on('close', () => {
      console.error('\nExiting...');
      socket.disconnect();
      resolve();
    });
  });
}

// Daemon mode - output messages as JSON lines
async function daemonMode(token: string): Promise<void> {
  const socket: Socket = io(HUB_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
  });

  console.error('Starting daemon mode...');
  console.error('Press Ctrl+C to stop\n');

  socket.on('connect', () => {
    console.error('Connected to Hub');
  });

  socket.on('disconnect', () => {
    console.error('Disconnected from Hub, reconnecting...');
  });

  socket.on('message', (msg: ChatMessage) => {
    // Output as JSON line for piping
    console.log(JSON.stringify(msg));
  });

  socket.on('error', (err: Error) => {
    console.error('Socket error:', err.message);
  });

  // Keep running until interrupted
  return new Promise((resolve) => {
    process.on('SIGINT', () => {
      console.error('\nExiting...');
      socket.disconnect();
      resolve();
    });
  });
}

// Send mode - send one message and exit
async function sendMode(token: string, content: string, sender: string): Promise<void> {
  const socket: Socket = io(HUB_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    timeout: 5000,
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.emit('message', { sender, content });
      // Give it a moment to send
      setTimeout(() => {
        socket.disconnect();
        console.error('Message sent successfully');
        resolve();
      }, 500);
    });

    socket.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Main
async function main(): Promise<void> {
  const { mode, message, sender, forceLogin } = parseArgs();

  try {
    const token = await ensureAuth(forceLogin);

    switch (mode) {
      case 'interactive':
        await interactiveMode(token);
        break;
      case 'daemon':
        await daemonMode(token);
        break;
      case 'send':
        if (!message) {
          throw new Error('No message provided. Use --send "your message here"');
        }
        await sendMode(token, message, sender);
        break;
    }
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
