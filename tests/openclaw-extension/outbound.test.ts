import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { sendHubMessage, sendHubReaction } from '../../openclaw-extension/src/outbound';
import type { CoreConfig } from '../../openclaw-extension/src/types';

jest.mock('../../openclaw-extension/src/auth', () => ({
  loadHubToken: jest.fn(() => 'cached-token'),
  ensureHubAuth: jest.fn<() => Promise<string>>().mockResolvedValue('auth-token'),
}));

import { ensureHubAuth } from '../../openclaw-extension/src/auth';

const cfg = (url = 'https://hub.example.com'): CoreConfig =>
  ({ channels: { 'swissclaw-hub': { url } } } as unknown as CoreConfig);

const okResponse = (status: number): Response =>
  ({ ok: status >= 200 && status < 300, status, text: async () => '' } as Response);

beforeEach(() => { jest.clearAllMocks(); });

describe('sendHubMessage', () => {
  it('returns ok: false when no hub url configured', async () => {
    const result = await sendHubMessage('hello', { cfg: cfg('') });
    expect(result).toEqual({ ok: false, error: 'Hub URL not configured' });
  });

  it('POSTs and returns ok: true on 200', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(okResponse(200));
    const result = await sendHubMessage('hello', { cfg: cfg() });
    expect(result.ok).toBe(true);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/service/messages');
    expect(JSON.parse(init.body as string).content).toBe('hello');
  });

  it('retries with fresh token on 401', async () => {
    global.fetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(okResponse(401))
      .mockResolvedValueOnce(okResponse(200));

    const result = await sendHubMessage('hello', { cfg: cfg() });
    expect(result.ok).toBe(true);
    expect(ensureHubAuth).toHaveBeenCalledWith('https://hub.example.com', true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns ok: false on non-auth failure', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(okResponse(500));
    const result = await sendHubMessage('hello', { cfg: cfg() });
    expect(result).toEqual({ ok: false, error: 'HTTP 500' });
  });

  it('includes conversationId when provided', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(okResponse(200));
    await sendHubMessage('hello', { cfg: cfg(), conversationId: 'conv-1' });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).conversationId).toBe('conv-1');
  });
});

describe('sendHubReaction', () => {
  it('returns ok: false when no hub url configured', async () => {
    const result = await sendHubReaction(1, '👍', { cfg: cfg('') });
    expect(result).toEqual({ ok: false, error: 'Hub URL not configured' });
  });

  it('uses POST to add a reaction', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(okResponse(200));
    await sendHubReaction(42, '👍', { cfg: cfg() });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
  });

  it('uses DELETE to remove a reaction', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue(okResponse(200));
    await sendHubReaction(42, '👍', { cfg: cfg(), remove: true });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('DELETE');
  });

  it('returns ok: true on 409 (reaction already exists)', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({ ...okResponse(409), ok: false });
    const result = await sendHubReaction(42, '👍', { cfg: cfg() });
    expect(result).toEqual({ ok: true });
  });

  it('returns ok: true on 404 when removing (already removed)', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: false, status: 404, text: async () => 'not found',
    } as Response);
    const result = await sendHubReaction(42, '👍', { cfg: cfg(), remove: true });
    expect(result).toEqual({ ok: true });
  });

  it('retries with fresh token on 403', async () => {
    global.fetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce(okResponse(403))
      .mockResolvedValueOnce(okResponse(200));

    const result = await sendHubReaction(42, '👍', { cfg: cfg() });
    expect(result.ok).toBe(true);
    expect(ensureHubAuth).toHaveBeenCalledWith('https://hub.example.com', true);
  });

  it('returns ok: false on unexpected error', async () => {
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: false, status: 500, text: async () => 'server error',
    } as Response);
    const result = await sendHubReaction(42, '👍', { cfg: cfg() });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });
});
