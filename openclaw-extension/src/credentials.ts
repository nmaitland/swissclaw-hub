import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export interface CredentialProvider {
  getCredentials(): Promise<{ username: string; password: string }>;
}

let cachedProviderPath: string | undefined;

function getProviderPath(): string {
  if (cachedProviderPath !== undefined) return cachedProviderPath;

  try {
    // Ask OpenClaw directly — slow but authoritative. Result is cached after first call.
    const output = execFileSync(
      "openclaw",
      ["config", "get", "agents.defaults.workspace"],
      { encoding: "utf-8", timeout: 10_000 },
    );
    // Output includes a branding header; the path is the last non-empty line.
    const lines = output.split("\n").map((l) => l.trim()).filter(Boolean);
    const workspacePath = lines[lines.length - 1];
    if (workspacePath && path.isAbsolute(workspacePath)) {
      cachedProviderPath = path.join(
        workspacePath,
        ".openclaw",
        "credentials",
        "swissclaw-hub.ts",
      );
      return cachedProviderPath;
    }
  } catch {
    // openclaw not in PATH or command failed — fall through to derived path
  }

  // Fallback: derive from the extension's installed location.
  // When installed: <openclaw_dir>/extensions/swissclaw-hub/src/credentials.ts
  // Three levels up is <openclaw_dir>, workspace is at <openclaw_dir>/workspace/
  const __filename = fileURLToPath(import.meta.url);
  const OPENCLAW_DIR = path.resolve(path.dirname(__filename), "..", "..", "..");
  cachedProviderPath = path.join(
    OPENCLAW_DIR,
    ".openclaw",
    "credentials",
    "swissclaw-hub.ts",
  );
  return cachedProviderPath;
}

export async function loadCredentials(): Promise<{
  username: string;
  password: string;
}> {
  const providerPath = getProviderPath();

  // Try custom credential provider script first
  if (fs.existsSync(providerPath)) {
    try {
      const mod = await import(providerPath);
      const provider: CredentialProvider = mod.default ?? mod;
      return await provider.getCredentials();
    } catch (err) {
      throw new Error(`Credential provider at ${providerPath} failed: ${err}`);
    }
  }

  // Fall back to environment variables
  const username = process.env.SWISSCLAW_USERNAME?.trim();
  const password = process.env.SWISSCLAW_PASSWORD?.trim();

  if (!username || !password) {
    throw new Error(
      "Hub credentials not configured. Either:\n" +
        `  1. Create a credential provider at ${providerPath}\n` +
        "  2. Set SWISSCLAW_USERNAME and SWISSCLAW_PASSWORD environment variables",
    );
  }

  return { username, password };
}
