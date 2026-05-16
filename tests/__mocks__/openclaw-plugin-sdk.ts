// Mock for openclaw/plugin-sdk — used in tests only.
// The real SDK is provided by the OpenClaw runtime in production.

type MockFn = ((...args: any[]) => any) & {
  mockImplementation: (impl: (...args: any[]) => any) => MockFn;
  mockResolvedValue: (value: unknown) => MockFn;
  mockReturnValue: (value: unknown) => MockFn;
};

const createFallbackMockFn = (impl?: (...args: any[]) => any): MockFn => {
  let currentImpl = impl;
  const fn = ((...args: any[]) => {
    if (currentImpl) return currentImpl(...args);
    return undefined;
  }) as MockFn;

  fn.mockImplementation = (nextImpl) => {
    currentImpl = nextImpl;
    return fn;
  };
  fn.mockResolvedValue = (value) => {
    currentImpl = async () => value;
    return fn;
  };
  fn.mockReturnValue = (value) => {
    currentImpl = () => value;
    return fn;
  };

  return fn;
};

const jestApi = (globalThis as { jest?: { fn: typeof createFallbackMockFn } }).jest ?? {
  fn: createFallbackMockFn,
};

// Type stubs — the real types are provided by the OpenClaw runtime.
// Exported as 'any' so extension source files compile without the real SDK.
export type ChannelPlugin<T = any> = any;
export type OpenClawPluginApi = any;
export type PluginRuntime = any;
export type ChannelGatewayContext<T = any> = any;
export type ChannelLogSink = any;
export type OpenClawConfig = any;
export type OutboundReplyPayload = any;

export const emptyPluginConfigSchema = jestApi.fn(() => ({}));
export const buildBaseAccountStatusSnapshot = jestApi.fn(({ account, runtime }: any) => ({
  accountId: account.accountId,
  name: account.name,
  enabled: account.enabled,
  configured: account.configured,
  runtime,
}));
export const buildBaseChannelStatusSummary = jestApi.fn(({ snapshot }: any) => snapshot);
export const collectStatusIssuesFromLastError = jestApi.fn(() => []);
export const createDefaultChannelRuntimeState = jestApi.fn((accountId: string) => ({
  accountId,
  connected: false,
  running: false,
}));
export const jsonResult = jestApi.fn((data: unknown) => data);
export const readStringParam = jestApi.fn(
  (params: Record<string, unknown>, key: string) => params?.[key] as string | undefined,
);
export const readBooleanParam = jestApi.fn(
  (params: Record<string, unknown>, key: string) => params?.[key] as boolean | undefined,
);
export const createAccountStatusSink = jestApi.fn(() => jestApi.fn());
export const dispatchInboundReplyWithBase = jestApi.fn();
export const runPassiveAccountLifecycle = jestApi.fn();
export const createRestrictSendersChannelSecurity = jestApi.fn(() => ({
  resolveDmPolicy: () => ({ policy: "allowlist", allowFrom: [] }),
}));
export const createPluginRuntimeStore = jestApi.fn(() => ({
  setRuntime: jestApi.fn(),
  getRuntime: jestApi.fn(),
}));
