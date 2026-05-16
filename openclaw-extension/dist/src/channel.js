import { buildBaseAccountStatusSnapshot, buildBaseChannelStatusSummary, collectStatusIssuesFromLastError, } from "openclaw/plugin-sdk/status-helpers";
import { readStringParam } from "openclaw/plugin-sdk/param-readers";
import { readBooleanParam } from "openclaw/plugin-sdk/boolean-param";
import { createRestrictSendersChannelSecurity } from "openclaw/plugin-sdk/channel-policy";
import { jsonResult } from "openclaw/plugin-sdk/channel-actions";
function createDefaultChannelRuntimeState(accountId) {
    return { accountId, connected: false, running: false };
}
import { startHubGateway } from "./gateway.js";
import { sendHubMessage, sendHubReaction } from "./outbound.js";
const CHANNEL_ID = "swissclaw-hub";
const DEFAULT_ACCOUNT_ID = "default";
function looksLikeHubConversationId(value) {
    const trimmed = value?.trim();
    if (!trimmed)
        return false;
    return /^[0-9a-f-]+:[A-Za-z0-9.-]+$/i.test(trimmed);
}
function resolveHubAccount(params) {
    const hubCfg = params.cfg.channels?.["swissclaw-hub"];
    const accountId = params.accountId || DEFAULT_ACCOUNT_ID;
    const accountCfg = hubCfg?.accounts?.[accountId] ??
        hubCfg ??
        {};
    const url = accountCfg.url || hubCfg?.url || process.env.HUB_URL || "";
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
const hubSecurityAdapter = createRestrictSendersChannelSecurity({
    channelKey: CHANNEL_ID,
    resolveDmPolicy: (account) => account.config.dmPolicy,
    resolveDmAllowFrom: (account) => account.allowFrom,
    resolveGroupPolicy: () => null,
    surface: "Swissclaw Hub chats",
    openScope: "paired users",
    groupPolicyPath: "channels.swissclaw-hub.groupPolicy",
    groupAllowFromPath: "channels.swissclaw-hub.groupAllowFrom",
    defaultDmPolicy: "pairing",
    allowFromPathSuffix: "allowFrom",
    policyPathSuffix: "dmPolicy",
});
export const hubPlugin = {
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
            resolveTarget: async ({ input, normalized }) => {
                const to = normalized || input;
                return { to, kind: "user", display: to };
            },
        },
    },
    config: {
        listAccountIds: (cfg) => {
            const hubCfg = cfg.channels?.["swissclaw-hub"];
            if (hubCfg?.accounts) {
                return Object.keys(hubCfg.accounts);
            }
            return [DEFAULT_ACCOUNT_ID];
        },
        resolveAccount: (cfg, accountId) => resolveHubAccount({ cfg: cfg, accountId }),
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
                cfg: params.cfg,
                accountId: params.accountId,
            });
            return account.allowFrom;
        },
    },
    security: hubSecurityAdapter,
    outbound: {
        deliveryMode: "direct",
        textChunkLimit: 4900,
        resolveTarget: ({ to }) => {
            const normalized = to?.replace(/^hub:/i, "") || "default";
            return { ok: true, to: normalized };
        },
        sendText: async ({ cfg, text, to }) => {
            const result = await sendHubMessage(text, {
                cfg: cfg,
                ...(looksLikeHubConversationId(to) ? { conversationId: to } : {}),
            });
            return { channel: CHANNEL_ID, ...result };
        },
        sendMedia: async ({ cfg, text, mediaUrl, to }) => {
            const combined = mediaUrl ? `${text}\n\n${mediaUrl}` : text;
            const result = await sendHubMessage(combined, {
                cfg: cfg,
                ...(looksLikeHubConversationId(to) ? { conversationId: to } : {}),
            });
            return { channel: CHANNEL_ID, ...result };
        },
    },
    actions: {
        describeMessageTool: () => ({
            actions: ["react"],
        }),
        supportsAction: ({ action }) => action === "react",
        handleAction: async ({ action, params, cfg, toolContext }) => {
            if (action === "react") {
                const messageIdRaw = readStringParam(params, "messageId") ??
                    readStringParam(params, "message_id") ??
                    toolContext?.currentMessageId;
                if (!messageIdRaw) {
                    throw new Error("messageId required. Provide messageId explicitly or react to the current inbound message.");
                }
                const messageId = String(messageIdRaw).trim();
                const numericId = parseInt(messageId, 10);
                if (isNaN(numericId)) {
                    throw new Error(`Invalid messageId: ${messageId}. Expected numeric message ID.`);
                }
                const emoji = readStringParam(params, "emoji", { allowEmpty: true });
                const remove = readBooleanParam(params, "remove");
                if (remove) {
                    if (!emoji) {
                        throw new Error("Emoji required to remove reaction.");
                    }
                    await sendHubReaction(numericId, emoji, {
                        cfg: cfg,
                        remove: true,
                    });
                    return jsonResult({ ok: true, removed: emoji });
                }
                if (!emoji) {
                    throw new Error("Emoji required to add reaction.");
                }
                await sendHubReaction(numericId, emoji, { cfg: cfg });
                return jsonResult({ ok: true, added: emoji });
            }
            throw new Error(`Action ${action} not supported for ${CHANNEL_ID}.`);
        },
    },
    status: {
        defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID),
        buildChannelSummary: ({ snapshot }) => buildBaseChannelStatusSummary(snapshot),
        buildAccountSnapshot: ({ account, runtime }) => buildBaseAccountStatusSnapshot({
            account: {
                accountId: account.accountId,
                name: account.name,
                enabled: account.enabled,
                configured: account.configured,
            },
            runtime: runtime ?? createDefaultChannelRuntimeState(account.accountId),
        }),
        collectStatusIssues: (accounts) => collectStatusIssuesFromLastError(CHANNEL_ID, accounts),
    },
    gateway: {
        startAccount: async (ctx) => {
            await startHubGateway(ctx);
        },
    },
};
