// Mock for openclaw/plugin-sdk — used in tests only.
// The real SDK is provided by the OpenClaw runtime in production.
import { jest } from '@jest/globals';

// Type stubs — the real types are provided by the OpenClaw runtime.
// Exported as 'any' so extension source files compile without the real SDK.
export type ChannelPlugin<T = any> = any;
export type OpenClawPluginApi = any;
export type PluginRuntime = any;
export type ChannelGatewayContext<T = any> = any;
export type ChannelLogSink = any;
export type OpenClawConfig = any;
export type OutboundReplyPayload = any;

export const emptyPluginConfigSchema = jest.fn(() => ({}));
export const buildBaseAccountStatusSnapshot = jest.fn(({ account, runtime }: any) => ({
  accountId: account.accountId,
  name: account.name,
  enabled: account.enabled,
  configured: account.configured,
  runtime,
}));
export const buildBaseChannelStatusSummary = jest.fn(({ snapshot }: any) => snapshot);
export const collectStatusIssuesFromLastError = jest.fn(() => []);
export const createDefaultChannelRuntimeState = jest.fn((accountId: string) => ({
  accountId,
  connected: false,
  running: false,
}));
export const jsonResult = jest.fn((data: unknown) => data);
export const readStringParam = jest.fn(
  (params: Record<string, unknown>, key: string) => params?.[key] as string | undefined,
);
export const readBooleanParam = jest.fn(
  (params: Record<string, unknown>, key: string) => params?.[key] as boolean | undefined,
);
export const createAccountStatusSink = jest.fn(() => jest.fn());
export const dispatchInboundReplyWithBase = jest.fn();
export const runPassiveAccountLifecycle = jest.fn();
export const createPluginRuntimeStore = jest.fn(() => ({
  setRuntime: jest.fn(),
  getRuntime: jest.fn(),
}));
