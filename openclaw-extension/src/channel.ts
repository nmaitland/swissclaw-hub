import type { ChannelPlugin } from "openclaw/plugin-sdk";
import {
  buildBaseAccountStatusSnapshot,
  buildBaseChannelStatusSummary,
  collectStatusIssuesFromLastError,
  createDefaultChannelRuntimeState,
  jsonResult,
  readStringParam,
  readBooleanParam,
} from "openclaw/plugin-sdk";
import { startHubGateway } from "./gateway.js";
import { sendHubMessage, sendHubReaction } from "./outbound.js";
import type { CoreConfig, HubAccountConfig } from "./types.js";

const CHANNEL_ID = "swissclaw-hub";
const DEFAULT_ACCOUNT_ID = "default";

function looksLikeHubConversationId(value: string | undefined | null): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return /^[0-9a-f-]+:[A-Za-z0-9.-]+$/i.test(trimmed);
}

type ResolvedHubAccount = {
  accountId: string;
  name: string;
  url: string;
  configured: boolean;
  enabled: boolean;
  allowFrom: string[];
  config: HubAccountConfig;
};

function resolveHubAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedHubAccount {
  const hubCfg = params.cfg.channels?.["swissclaw-hub"];
  const accountId = params.accountId || DEFAULT_ACCOUNT_ID;
  const accountCfg =
    (hubCfg?.accounts?.[accountId] as HubAccountConfig | undefined) ??
    (hubCfg as HubAccountConfig | undefined) ??
    {};
  const url =
    accountCfg.url || hubCfg?.url || process.env.SWISSCLAW_HUB_URL || "";

  return {
    accountId,
    name: accountCfg.name || "Swissclaw Hub",
    url,
    configured: !!url,
    enabled: accountCfg.enabled !== false,
    allowFrom: accountCfg.allowFrom || hubCfg?.allowFrom || [],
    config: accountCfg,
  };
}

export const hubPlugin: ChannelPlugin<ResolvedHubAccount> = {
  id: CHANNEL_ID,
  meta: {
    id: CHANNEL_ID,
    label: "Swissclaw Hub",
    selectionLabel: "Swissclaw Hub (plugin)",
    docsPath: "/channels/swissclaw-hub",
    blurb: "Swissclaw Hub web chat",
    order: 80,
  },
  capabilities: {
    chatTypes: ["direct"],
  },

  messaging: {
    targetResolver: {
      hint: "Swissclaw Hub username (e.g., operator)",
      looksLikeId: (raw, normalized) => {
        return /^hub:/i.test(raw) || /^[A-Za-z]+$/.test(normalized);
      },
      resolveTarget: ({ input, normalized }) => {
        const to = normalized || input;
        return { to, kind: "user" as const, display: to };
      },
    },
  },

  config: {
    listAccountIds: (cfg) => {
      const hubCfg = (cfg as CoreConfig).channels?.["swissclaw-hub"];
      if (hubCfg?.accounts) {
        return Object.keys(hubCfg.accounts);
      }
      return [DEFAULT_ACCOUNT_ID];
    },

    resolveAccount: (cfg, accountId) =>
      resolveHubAccount({ cfg: cfg as CoreConfig, accountId }),

    defaultAccountId: () => DEFAULT_ACCOUNT_ID,

    isConfigured: (account) => account.configured,

    isEnabled: (account) => account.enabled,

    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
    }),

    resolveAllowFrom: (params) => {
      const account = resolveHubAccount({
        cfg: params.cfg as CoreConfig,
        accountId: params.accountId,
      });
      return account.allowFrom;
    },
  },

  security: {
    resolveDmPolicy: () => ({
      policy: "allowlist",
      allowFrom: [],
    }),
  },

  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4900,
    resolveTarget: ({ to }) => {
      const normalized = to?.replace(/^hub:/i, "") || "default";
      return { ok: true, to: normalized };
    },
    sendText: async ({ cfg, text, to }) => {
      const result = await sendHubMessage(text, {
        cfg: cfg as CoreConfig,
        ...(looksLikeHubConversationId(to) ? { conversationId: to } : {}),
      });
      return { channel: CHANNEL_ID, ...result };
    },
    sendMedia: async ({ cfg, text, mediaUrl, to }) => {
      const combined = mediaUrl ? `${text}\n\n${mediaUrl}` : text;
      const result = await sendHubMessage(combined, {
        cfg: cfg as CoreConfig,
        ...(looksLikeHubConversationId(to) ? { conversationId: to } : {}),
      });
      return { channel: CHANNEL_ID, ...result };
    },
    sendReaction: async ({ cfg, messageId, emoji }) => {
      const numericId = parseInt(messageId, 10);
      if (isNaN(numericId)) {
        return { channel: CHANNEL_ID, ok: false, error: "Invalid message ID" };
      }
      const result = await sendHubReaction(numericId, emoji, {
        cfg: cfg as CoreConfig,
      });
      return { channel: CHANNEL_ID, ...result };
    },
    removeReaction: async ({ cfg, messageId, emoji }) => {
      const numericId = parseInt(messageId, 10);
      if (isNaN(numericId)) {
        return { channel: CHANNEL_ID, ok: false, error: "Invalid message ID" };
      }
      const result = await sendHubReaction(numericId, emoji, {
        cfg: cfg as CoreConfig,
        remove: true,
      });
      return { channel: CHANNEL_ID, ...result };
    },
  },

  actions: {
    listActions: () => ["send", "react"],
    supportsAction: ({ action }) => action === "react",
    handleAction: async ({ action, params, cfg, toolContext }) => {
      if (action === "react") {
        const messageIdRaw =
          readStringParam(params, "messageId") ??
          readStringParam(params, "message_id") ??
          toolContext?.currentMessageId;

        if (!messageIdRaw) {
          throw new Error(
            "messageId required. Provide messageId explicitly or react to the current inbound message.",
          );
        }

        const messageId = String(messageIdRaw).trim();
        const numericId = parseInt(messageId, 10);
        if (isNaN(numericId)) {
          throw new Error(
            `Invalid messageId: ${messageId}. Expected numeric message ID.`,
          );
        }

        const emoji = readStringParam(params, "emoji", { allowEmpty: true });
        const remove = readBooleanParam(params, "remove");

        if (remove) {
          if (!emoji) {
            throw new Error("Emoji required to remove reaction.");
          }
          await sendHubReaction(numericId, emoji, {
            cfg: cfg as CoreConfig,
            remove: true,
          });
          return jsonResult({ ok: true, removed: emoji });
        }

        if (!emoji) {
          throw new Error("Emoji required to add reaction.");
        }

        await sendHubReaction(numericId, emoji, { cfg: cfg as CoreConfig });
        return jsonResult({ ok: true, added: emoji });
      }

      throw new Error(`Action ${action} not supported for ${CHANNEL_ID}.`);
    },
  },

  status: {
    defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID),

    buildChannelSummary: ({ snapshot }) =>
      buildBaseChannelStatusSummary(snapshot),

    buildAccountSnapshot: ({ account, runtime }) =>
      buildBaseAccountStatusSnapshot({
        account: {
          accountId: account.accountId,
          name: account.name,
          enabled: account.enabled,
          configured: account.configured,
        },
        runtime: runtime ?? createDefaultChannelRuntimeState(account.accountId),
      }),

    collectStatusIssues: (accounts) =>
      collectStatusIssuesFromLastError(CHANNEL_ID, accounts),
  },

  gateway: {
    startAccount: async (ctx) => {
      await startHubGateway(ctx);
    },
  },
};
