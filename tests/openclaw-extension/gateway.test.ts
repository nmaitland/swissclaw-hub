import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { startHubGateway } from '../../openclaw-extension/src/gateway';
import { dispatchInboundReplyWithBase, runPassiveAccountLifecycle } from 'openclaw/plugin-sdk';

const socketHandlers = new Map<string, (...args: any[]) => any>();
const socket = {
  on: jest.fn((event: string, handler: (...args: any[]) => any) => {
    socketHandlers.set(event, handler);
    return socket;
  }),
  disconnect: jest.fn(),
  connect: jest.fn(),
  auth: {},
};

const finalizeInboundContext = jest.fn((payload: any) => payload);
const resolveAgentRoute = jest.fn(() => ({ agentId: 'agent-main' }));
const resolveStorePath = jest.fn(() => 'store-path');
const recordActivity = jest.fn();

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => socket),
}));

jest.mock('../../openclaw-extension/src/auth', () => ({
  ensureHubAuth: jest.fn<() => Promise<string>>().mockResolvedValue('token'),
}));

jest.mock('../../openclaw-extension/src/runtime', () => ({
  getHubRuntime: jest.fn(() => ({
    channel: {
      routing: { resolveAgentRoute },
      session: { resolveStorePath },
      reply: { finalizeInboundContext },
      activity: { record: recordActivity },
    },
  })),
}));

describe('startHubGateway conversation routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    socketHandlers.clear();
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    } as Response);
    (runPassiveAccountLifecycle as jest.Mock).mockImplementation(async ({ start }: any) => {
      await start();
    });
    (dispatchInboundReplyWithBase as jest.Mock).mockResolvedValue(undefined);
  });

  const ctx = {
    accountId: 'default',
    account: {
      accountId: 'default',
      url: 'https://hub.example.com',
      configured: true,
      enabled: true,
    },
    abortSignal: undefined,
    cfg: {},
    log: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
    setStatus: jest.fn(),
  } as any;

  it('stores inbound message conversation id in OriginatingTo', async () => {
    await startHubGateway(ctx);

    const handler = socketHandlers.get('message');
    expect(handler).toBeDefined();

    await handler?.({
      id: '42',
      sender: 'Neil',
      content: 'Hello',
      created_at: '2026-03-30T12:00:00.000Z',
      conversation_id: '123e4567-e89b-12d3-a456-426614174000:swissclaw.example.com',
    });

    expect(finalizeInboundContext).toHaveBeenCalledWith(
      expect.objectContaining({
        OriginatingTo: '123e4567-e89b-12d3-a456-426614174000:swissclaw.example.com',
      }),
    );
  });

  it('stores reaction conversation id in OriginatingTo', async () => {
    await startHubGateway(ctx);

    const handler = socketHandlers.get('reaction');
    expect(handler).toBeDefined();

    await handler?.({
      emoji: '👍',
      reactor: 'Neil',
      messageId: 42,
      conversationId: '123e4567-e89b-12d3-a456-426614174000:swissclaw.example.com',
      createdAt: '2026-03-30T12:00:00.000Z',
    });

    expect(finalizeInboundContext).toHaveBeenCalledWith(
      expect.objectContaining({
        OriginatingTo: '123e4567-e89b-12d3-a456-426614174000:swissclaw.example.com',
      }),
    );
  });
});
