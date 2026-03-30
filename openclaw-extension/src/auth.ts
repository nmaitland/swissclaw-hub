import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadCredentials } from "./credentials.js";

const HUB_TOKEN_FILE = path.join(os.homedir(), ".swissclaw-token");

export function loadHubToken(): string | null {
  try {
    if (fs.existsSync(HUB_TOKEN_FILE)) {
      return fs.readFileSync(HUB_TOKEN_FILE, "utf-8").trim() || null;
    }
  } catch {
    // ignore
  }
  return null;
}

function saveHubToken(token: string): void {
  fs.writeFileSync(HUB_TOKEN_FILE, token, { mode: 0o600 });
}

function clearHubToken(): void {
  try {
    fs.unlinkSync(HUB_TOKEN_FILE);
  } catch {
    // ignore
  }
}

async function validateToken(hubUrl: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${hubUrl}/api/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function loginToHub(hubUrl: string): Promise<string> {
  const { username, password } = await loadCredentials();

  const res = await fetch(`${hubUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = (await res.json()) as { token?: string; error?: string };
  if (!res.ok || !data.token) {
    throw new Error(`Hub login failed: ${data.error || `HTTP ${res.status}`}`);
  }

  saveHubToken(data.token);
  return data.token;
}

export async function ensureHubAuth(
  hubUrl: string,
  forceLogin = false,
): Promise<string> {
  if (!forceLogin) {
    const token = loadHubToken();
    if (token && (await validateToken(hubUrl, token))) {
      return token;
    }
  }

  clearHubToken();
  return loginToHub(hubUrl);
}
