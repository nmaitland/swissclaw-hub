import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from 'dotenv';

config({ override: false });

export const HUB_URL = process.env.SWISSCLAW_HUB_URL || 'https://your-instance.example.com';
export const HUB_TOKEN_FILE = path.join(os.homedir(), '.swissclaw-token');
const HUB_TOKEN_LOCK_FILE = `${HUB_TOKEN_FILE}.lock`;
const LOCK_TIMEOUT_MS = 30_000;
const LOCK_STALE_MS = 120_000;

interface LoginResponse {
  token?: string;
  success?: boolean;
  error?: string;
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const tryAcquireLock = (): number | null => {
  try {
    return fs.openSync(HUB_TOKEN_LOCK_FILE, 'wx');
  } catch {
    return null;
  }
};

const isLockStale = (): boolean => {
  try {
    const stat = fs.statSync(HUB_TOKEN_LOCK_FILE);
    return Date.now() - stat.mtimeMs > LOCK_STALE_MS;
  } catch {
    return false;
  }
};

const releaseLock = (fd: number | null): void => {
  if (fd === null) return;
  try {
    fs.closeSync(fd);
  } catch {
    // ignore
  }
  try {
    fs.unlinkSync(HUB_TOKEN_LOCK_FILE);
  } catch {
    // ignore
  }
};

const withTokenLock = async <T>(fn: () => Promise<T>): Promise<T> => {
  const started = Date.now();
  let fd: number | null = null;

  while (fd === null) {
    fd = tryAcquireLock();
    if (fd !== null) break;

    if (isLockStale()) {
      try {
        fs.unlinkSync(HUB_TOKEN_LOCK_FILE);
      } catch {
        // ignore and continue waiting
      }
      continue;
    }

    if (Date.now() - started > LOCK_TIMEOUT_MS) {
      throw new Error(`Timed out waiting for auth lock (${LOCK_TIMEOUT_MS}ms)`);
    }
    await sleep(250);
  }

  try {
    return await fn();
  } finally {
    releaseLock(fd);
  }
};

export const loadHubToken = (): string | null => {
  if (process.env.SWISSCLAW_AUTH_TOKEN && process.env.SWISSCLAW_AUTH_TOKEN.trim()) {
    return process.env.SWISSCLAW_AUTH_TOKEN.trim();
  }

  try {
    if (fs.existsSync(HUB_TOKEN_FILE)) {
      return fs.readFileSync(HUB_TOKEN_FILE, 'utf-8').trim() || null;
    }
  } catch {
    // ignore
  }
  return null;
};

export const saveHubToken = (token: string): void => {
  fs.writeFileSync(HUB_TOKEN_FILE, token, { mode: 0o600 });
};

export const clearHubToken = (): void => {
  try {
    if (fs.existsSync(HUB_TOKEN_FILE)) {
      fs.unlinkSync(HUB_TOKEN_FILE);
    }
  } catch {
    // ignore
  }
};

export const validateHubToken = async (token: string): Promise<boolean> => {
  try {
    const response = await fetch(`${HUB_URL}/api/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.status === 200;
  } catch {
    return false;
  }
};

export const loginToHub = async (): Promise<string> => {
  const username = process.env.SWISSCLAW_USERNAME;
  const password = process.env.SWISSCLAW_PASSWORD;
  if (!username || !password) {
    throw new Error('SWISSCLAW_USERNAME and SWISSCLAW_PASSWORD must be set for login');
  }

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
  return data.token;
};

export const ensureHubAuth = async (forceLogin: boolean = false): Promise<string> => {
  if (process.env.SWISSCLAW_AUTH_TOKEN && process.env.SWISSCLAW_AUTH_TOKEN.trim()) {
    return process.env.SWISSCLAW_AUTH_TOKEN.trim();
  }

  return withTokenLock(async () => {
    if (forceLogin) {
      clearHubToken();
    }

    const token = loadHubToken();
    if (token && await validateHubToken(token)) {
      return token;
    }

    if (token) {
      clearHubToken();
    }

    return loginToHub();
  });
};
