import { ensureHubAuth, loadHubToken } from "./auth.js";
import type { CoreConfig } from "./types.js";

function resolveHubUrl(cfg: CoreConfig): string {
  const hubCfg = cfg.channels?.["swissclaw-hub"];
  return hubCfg?.url || process.env.HUB_URL || "";
}

export async function sendHubMessage(
  text: string,
  opts: { cfg: CoreConfig; accountId?: string; conversationId?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const hubUrl = resolveHubUrl(opts.cfg);
  if (!hubUrl) {
    return { ok: false, error: "Hub URL not configured" };
  }

  const token = loadHubToken() || (await ensureHubAuth(hubUrl));

  const res = await fetch(`${hubUrl}/api/service/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: "Swissclaw",
      content: text,
      ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
    }),
  });

  if (res.status === 401 || res.status === 403) {
    const freshToken = await ensureHubAuth(hubUrl, true);
    const retry = await fetch(`${hubUrl}/api/service/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${freshToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: "Swissclaw",
        content: text,
        ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
      }),
    });
    if (!retry.ok) {
      return { ok: false, error: `HTTP ${retry.status}` };
    }
    return { ok: true };
  }

  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` };
  }
  return { ok: true };
}

export async function sendHubReaction(
  messageId: number,
  emoji: string,
  opts: { cfg: CoreConfig; accountId?: string; remove?: boolean },
): Promise<{ ok: boolean; error?: string }> {
  const hubUrl = resolveHubUrl(opts.cfg);
  if (!hubUrl) {
    return { ok: false, error: "Hub URL not configured" };
  }

  const token = loadHubToken() || (await ensureHubAuth(hubUrl));
  const method = opts.remove ? "DELETE" : "POST";

  const res = await fetch(
    `${hubUrl}/api/service/messages/${messageId}/reactions`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reactor: "Swissclaw", emoji }),
    },
  );

  if (res.status === 401 || res.status === 403) {
    const freshToken = await ensureHubAuth(hubUrl, true);
    const retry = await fetch(
      `${hubUrl}/api/service/messages/${messageId}/reactions`,
      {
        method,
        headers: {
          Authorization: `Bearer ${freshToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reactor: "Swissclaw", emoji }),
      },
    );
    if (!retry.ok) {
      return { ok: false, error: `HTTP ${retry.status}` };
    }
    return { ok: true };
  }

  if (!res.ok) {
    if (res.status === 409) return { ok: true }; // already exists
    if (res.status === 404 && opts.remove) return { ok: true }; // already removed
    const body = await res.text();
    return { ok: false, error: `HTTP ${res.status}: ${body}` };
  }
  return { ok: true };
}
