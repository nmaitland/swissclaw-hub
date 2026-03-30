import { io, type Socket } from "socket.io-client";
import type {
  ChannelGatewayContext,
  ChannelLogSink,
  OpenClawConfig,
} from "openclaw/plugin-sdk";
import {
  createAccountStatusSink,
  dispatchInboundReplyWithBase,
  runPassiveAccountLifecycle,
} from "openclaw/plugin-sdk";
import type { OutboundReplyPayload } from "openclaw/plugin-sdk";
import { ensureHubAuth } from "./auth.js";
import { getHubRuntime } from "./runtime.js";
import type { HubMessage, HubReactionUpdate, HubReactionRemove } from "./types.js";

const CHANNEL_ID = "swissclaw-hub";
const RECONNECT_DELAY_MS = 5_000;
const AUTH_REFRESH_COOLDOWN_MS = 30_000;

type ResolvedHubAccount = {
  accountId: string;
  url: string;
  configured: boolean;
  enabled: boolean;
};

function slugPart(value: string | undefined | null, fallback: string): string {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  return trimmed.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
}

function buildHubSessionKey(params: {
  accountId: string;
  msg: HubMessage;
}): string {
  const account = slugPart(params.accountId, "default");
  const conversation = slugPart(params.msg.conversation_id, "no-conversation");
  const peer = slugPart(params.msg.sender, "unknown-peer");

  return `agent:main:hub:${account}:${conversation}:${peer}`;
}

async function sendToHub(
  hubUrl: string,
  token: string,
  text: string,
  conversationId?: string | null,
): Promise<Response> {
  return fetch(`${hubUrl}/api/service/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: "Swissclaw",
      content: text,
      ...(conversationId ? { conversationId } : {}),
    }),
  });
}

async function setHubMessageState(
  hubUrl: string,
  token: string,
  messageId: string,
  state: string,
): Promise<void> {
  await fetch(`${hubUrl}/api/service/messages/${messageId}/state`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ state }),
  });
}

export async function startHubGateway(
  ctx: ChannelGatewayContext<ResolvedHubAccount>,
): Promise<void> {
  const { account, abortSignal } = ctx;
  const core = getHubRuntime();
  const log = ctx.log as ChannelLogSink;
  const statusSink = createAccountStatusSink({
    accountId: ctx.accountId,
    setStatus: ctx.setStatus,
  });

  if (!account.configured) {
    throw new Error(
      `Swissclaw Hub is not configured for account "${account.accountId}". ` +
        `Set channels.swissclaw-hub.url in your config.`,
    );
  }

  const hubUrl = account.url;

  await runPassiveAccountLifecycle({
    abortSignal,
    start: async () => {
      let token = await ensureHubAuth(hubUrl);
      let lastAuthRefresh = 0;

      const socket = io(hubUrl, {
        auth: { token },
        reconnection: true,
        reconnectionDelay: RECONNECT_DELAY_MS,
        transports: ["websocket", "polling"],
      });

      socket.on("connect", () => {
        log.info(`[${ctx.accountId}] connected to Hub`);
        statusSink({
          connected: true,
          running: true,
          lastConnectedAt: Date.now(),
          lastError: null,
        });
      });

      socket.on("disconnect", (reason) => {
        log.warn(`[${ctx.accountId}] disconnected: ${reason}`);
        statusSink({
          connected: false,
          lastDisconnect: { at: Date.now(), error: reason },
        });
      });

      socket.on("connect_error", async (err) => {
        const isAuthError =
          err.message.includes("Authentication") ||
          err.message.includes("401") ||
          err.message.includes("403");

        if (
          isAuthError &&
          Date.now() - lastAuthRefresh > AUTH_REFRESH_COOLDOWN_MS
        ) {
          log.info(`[${ctx.accountId}] auth error, refreshing token...`);
          lastAuthRefresh = Date.now();
          try {
            token = await ensureHubAuth(hubUrl, true);
            socket.auth = { token };
            socket.connect();
          } catch (authErr) {
            log.error(
              `[${ctx.accountId}] auth refresh failed: ${authErr}`,
            );
            statusSink({ lastError: String(authErr) });
          }
        } else {
          statusSink({ lastError: err.message });
        }
      });

      // Cancellation tracking for in-flight messages
      const cancelledMessageIds = new Set<string>();

      socket.on("message-state", (update: { messageId: string; state: string }) => {
        if (update.state === "cancelled") {
          cancelledMessageIds.add(String(update.messageId));
          // Prevent unbounded growth
          if (cancelledMessageIds.size > 100) {
            const first = cancelledMessageIds.values().next().value;
            if (first !== undefined) cancelledMessageIds.delete(first);
          }
          log.info(
            `[${ctx.accountId}] message ${update.messageId} cancelled by user`,
          );
        }
      });

      const dispatchReactionEvent = async (
        reactor: string,
        body: string,
        conversationId: string | null | undefined,
        timestamp: string,
      ) => {
        // Ignore reactions from our own agent
        if (reactor === "Swissclaw" || reactor === "Agent" || reactor === "System") {
          return;
        }

        const pseudoMsg: HubMessage = {
          id: `reaction-${Date.now()}`,
          sender: reactor,
          content: body,
          created_at: timestamp,
          conversation_id: conversationId,
        };

        const sessionKey = buildHubSessionKey({
          accountId: ctx.accountId,
          msg: pseudoMsg,
        });

        const route = core.channel.routing.resolveAgentRoute({
          cfg: ctx.cfg,
          channel: CHANNEL_ID,
          accountId: ctx.accountId,
          sessionKey,
        });

        const storePath = core.channel.session.resolveStorePath(
          (ctx.cfg as any).session?.store,
          { agentId: route.agentId },
        );

        const ctxPayload = core.channel.reply.finalizeInboundContext({
          Body: body,
          RawBody: body,
          From: `hub:${reactor}`,
          To: "hub:swissclaw",
          SessionKey: sessionKey,
          AccountId: ctx.accountId,
          ChatType: "direct",
          ConversationLabel: reactor,
          SenderName: reactor,
          SenderId: `hub:${reactor}`,
          Provider: CHANNEL_ID,
          Surface: CHANNEL_ID,
          MessageSid: pseudoMsg.id,
          Timestamp: new Date(timestamp).getTime(),
          OriginatingChannel: CHANNEL_ID,
          OriginatingTo: conversationId ?? `hub:${reactor}`,
        });

        try {
          await dispatchInboundReplyWithBase({
            cfg: ctx.cfg as OpenClawConfig,
            channel: CHANNEL_ID,
            accountId: ctx.accountId,
            route,
            storePath,
            ctxPayload,
            core,
            deliver: async (payload: OutboundReplyPayload) => {
              const text = payload.text ?? "";
              if (!text) return;
              try {
                const res = await sendToHub(hubUrl, token, text, conversationId);
                if (!res.ok) {
                  log.error(`[${ctx.accountId}] reaction reply send failed: HTTP ${res.status}`);
                }
              } catch (sendErr) {
                log.error(`[${ctx.accountId}] reaction reply send error: ${sendErr}`);
              }
            },
            onRecordError: (err) => {
              log.error(`[${ctx.accountId}] reaction record error: ${err}`);
            },
            onDispatchError: (err) => {
              log.error(`[${ctx.accountId}] reaction dispatch error: ${err}`);
            },
          });
        } catch (dispatchErr) {
          log.error(`[${ctx.accountId}] reaction dispatch failed: ${dispatchErr}`);
        }

        core.channel.activity.record({
          channel: CHANNEL_ID,
          accountId: ctx.accountId,
          direction: "inbound",
          at: Date.now(),
        });
      };

      socket.on("reaction", async (update: HubReactionUpdate) => {
        log.info(
          `[${ctx.accountId}] reaction ${update.emoji} from ${update.reactor} on message #${update.messageId}`,
        );
        await dispatchReactionEvent(
          update.reactor,
          `[Reacted ${update.emoji} to message #${update.messageId}]`,
          update.conversationId,
          update.createdAt,
        );
      });

      socket.on("reaction-remove", async (remove: HubReactionRemove) => {
        log.info(
          `[${ctx.accountId}] reaction removed ${remove.emoji} from ${remove.reactor} on message #${remove.messageId}`,
        );
        await dispatchReactionEvent(
          remove.reactor,
          `[Removed ${remove.emoji} reaction from message #${remove.messageId}]`,
          remove.conversationId,
          new Date().toISOString(),
        );
      });

      socket.on("message", async (msg: HubMessage) => {
        if (
          msg.sender === "Swissclaw" ||
          msg.sender === "Agent" ||
          msg.sender === "System"
        ) {
          return;
        }

        log.info(
          `[${ctx.accountId}] inbound from ${msg.sender}: ${msg.content.slice(0, 80)}`,
        );
        statusSink({ lastInboundAt: Date.now() });
        core.channel.activity.record({
          channel: CHANNEL_ID,
          accountId: ctx.accountId,
          direction: "inbound",
          at: Date.now(),
        });

        // Update processing state on Hub
        try {
          await setHubMessageState(hubUrl, token, msg.id, "processing");
        } catch (stateErr) {
          log.warn(
            `[${ctx.accountId}] failed to set processing state: ${stateErr}`,
          );
        }

        const senderId = `hub:${msg.sender}`;
        const sessionKey = buildHubSessionKey({
          accountId: ctx.accountId,
          msg,
        });

        const route = core.channel.routing.resolveAgentRoute({
          cfg: ctx.cfg,
          channel: CHANNEL_ID,
          accountId: ctx.accountId,
          sessionKey,
        });

        const storePath = core.channel.session.resolveStorePath(
          (ctx.cfg as any).session?.store,
          { agentId: route.agentId },
        );

        const ctxPayload = core.channel.reply.finalizeInboundContext({
          Body: msg.content,
          RawBody: msg.content,
          From: `hub:${msg.sender}`,
          To: "hub:swissclaw",
          SessionKey: sessionKey,
          AccountId: ctx.accountId,
          ChatType: "direct",
          ConversationLabel: msg.sender,
          SenderName: msg.sender,
          SenderId: senderId,
          Provider: CHANNEL_ID,
          Surface: CHANNEL_ID,
          MessageSid: String(msg.id),
          Timestamp: new Date(msg.created_at).getTime(),
          OriginatingChannel: CHANNEL_ID,
          OriginatingTo: msg.conversation_id ?? `hub:${msg.sender}`,
        });

        let dispatchFailed = false;
        let delivered = false;
        try {
          await dispatchInboundReplyWithBase({
            cfg: ctx.cfg as OpenClawConfig,
            channel: CHANNEL_ID,
            accountId: ctx.accountId,
            route,
            storePath,
            ctxPayload,
            core,
            deliver: async (payload: OutboundReplyPayload) => {
              const text = payload.text ?? "";
              if (!text) return;

              // Skip delivery if message was cancelled
              if (cancelledMessageIds.has(String(msg.id))) {
                log.info(
                  `[${ctx.accountId}] skipping delivery for cancelled message ${msg.id}`,
                );
                return;
              }

              try {
                const res = await sendToHub(hubUrl, token, text, msg.conversation_id);
                if (!res.ok) {
                  log.error(
                    `[${ctx.accountId}] send failed: HTTP ${res.status}`,
                  );
                }
              } catch (sendErr) {
                log.error(`[${ctx.accountId}] send error: ${sendErr}`);
              }

              delivered = true;
              statusSink({ lastOutboundAt: Date.now() });
              core.channel.activity.record({
                channel: CHANNEL_ID,
                accountId: ctx.accountId,
                direction: "outbound",
              });
            },
            onRecordError: (err) => {
              log.error(`[${ctx.accountId}] record error: ${err}`);
            },
            onDispatchError: (err) => {
              log.error(`[${ctx.accountId}] dispatch error: ${err}`);
            },
          });
        } catch (dispatchErr) {
          dispatchFailed = true;
          log.error(`[${ctx.accountId}] dispatch failed: ${dispatchErr}`);
        }

        // Mark terminal state after dispatch
        const isCancelled = cancelledMessageIds.has(String(msg.id));
        let terminalState: string;
        if (dispatchFailed) {
          terminalState = "failed";
        } else if (delivered) {
          terminalState = "done";
        } else if (isCancelled) {
          terminalState = "cancelled";
        } else {
          terminalState = "timeout";
        }

        // Clean up cancellation tracking
        cancelledMessageIds.delete(String(msg.id));

        try {
          await setHubMessageState(hubUrl, token, msg.id, terminalState);
        } catch {
          // best-effort
        }
      });

      return socket;
    },
    stop: async (socket) => {
      if (socket) {
        socket.disconnect();
      }
      log.info(`[${ctx.accountId}] stopped Hub gateway`);
      statusSink({ connected: false, running: false });
    },
  });
}
