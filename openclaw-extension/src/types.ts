import type { OpenClawConfig } from "openclaw/plugin-sdk";

export type HubAccountConfig = {
  name?: string;
  enabled?: boolean;
  url?: string;
  allowFrom?: string[];
};

export type HubConfig = HubAccountConfig & {
  accounts?: Record<string, HubAccountConfig>;
  defaultAccount?: string;
};

export type CoreConfig = OpenClawConfig & {
  channels?: OpenClawConfig["channels"] & {
    "swissclaw-hub"?: HubConfig;
  };
};

export type HubMessage = {
  id: string;
  sender: string;
  content: string;
  created_at: string;
  processing_state?: string;
  conversation_id?: string | null;
};

export type HubMessageStateUpdate = {
  messageId: string;
  state: "received" | "processing" | "thinking" | "responded" | "cancelled";
  sender: string;
  updatedAt: string;
};

export type HubReaction = {
  messageId: number;
  reactionId: number;
  reactor: string;
  emoji: string;
  createdAt: string;
  conversationId?: string | null;
};

export type HubReactionUpdate = HubReaction;

export type HubReactionRemove = {
  messageId: number;
  reactor: string;
  emoji: string;
  conversationId?: string | null;
};
