import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { hubPlugin } from '../../openclaw-extension/src/channel';
import type { CoreConfig } from '../../openclaw-extension/src/types';

jest.mock('../../openclaw-extension/src/gateway', () => ({
  startHubGateway: jest.fn(),
}));
jest.mock('../../openclaw-extension/src/outbound', () => ({
  sendHubMessage: jest.fn(),
  sendHubReaction: jest.fn(),
}));

beforeEach(() => { jest.clearAllMocks(); });

const makeConfig = (channelOverrides: Record<string, unknown> = {}): CoreConfig =>
  ({ channels: { 'swissclaw-hub': channelOverrides } } as unknown as CoreConfig);

describe('hubPlugin config', () => {
  describe('resolveAccount', () => {
    it('returns unconfigured when no url is set', () => {
      const account = hubPlugin.config.resolveAccount(makeConfig(), 'default');
      expect(account.configured).toBe(false);
      expect(account.url).toBe('');
    });

    it('uses url from channel config', () => {
      const account = hubPlugin.config.resolveAccount(
        makeConfig({ url: 'https://hub.example.com' }),
        'default',
      );
      expect(account.configured).toBe(true);
      expect(account.url).toBe('https://hub.example.com');
    });

    it('falls back to SWISSCLAW_HUB_URL env var', () => {
      process.env.SWISSCLAW_HUB_URL = 'https://env.example.com';
      const account = hubPlugin.config.resolveAccount(makeConfig(), 'default');
      expect(account.url).toBe('https://env.example.com');
      expect(account.configured).toBe(true);
      delete process.env.SWISSCLAW_HUB_URL;
    });

    it('is enabled by default', () => {
      const account = hubPlugin.config.resolveAccount(makeConfig(), 'default');
      expect(account.enabled).toBe(true);
    });

    it('respects enabled: false in config', () => {
      const account = hubPlugin.config.resolveAccount(
        makeConfig({ enabled: false }),
        'default',
      );
      expect(account.enabled).toBe(false);
    });

    it('reads named account config', () => {
      const cfg = {
        channels: {
          'swissclaw-hub': {
            accounts: { work: { url: 'https://work.example.com' } },
          },
        },
      } as unknown as CoreConfig;
      const account = hubPlugin.config.resolveAccount(cfg, 'work');
      expect(account.url).toBe('https://work.example.com');
      expect(account.accountId).toBe('work');
    });
  });

  describe('listAccountIds', () => {
    it("returns ['default'] when no accounts block", () => {
      expect(hubPlugin.config.listAccountIds(makeConfig())).toEqual(['default']);
    });

    it('returns named account ids when accounts block exists', () => {
      const cfg = {
        channels: { 'swissclaw-hub': { accounts: { a: {}, b: {} } } },
      } as unknown as CoreConfig;
      expect(hubPlugin.config.listAccountIds(cfg)).toEqual(['a', 'b']);
    });
  });
});

describe('hubPlugin messaging.targetResolver', () => {
  const resolver = hubPlugin.messaging!.targetResolver!;

  describe('looksLikeId', () => {
    it('accepts hub:-prefixed ids', () => {
      expect(resolver.looksLikeId('hub:Neil', 'hub:neil')).toBe(true);
    });

    it('accepts plain alphabetic names', () => {
      expect(resolver.looksLikeId('Neil', 'neil')).toBe(true);
    });

    it('rejects names with digits', () => {
      expect(resolver.looksLikeId('user123', 'user123')).toBe(false);
    });
  });

  describe('resolveTarget', () => {
    it('returns the normalized value as target', () => {
      const result = resolver.resolveTarget({ input: 'Neil', normalized: 'neil' } as any);
      expect(result.to).toBe('neil');
    });
  });
});

describe('hubPlugin outbound.resolveTarget', () => {
  it('strips hub: prefix', () => {
    const result = hubPlugin.outbound!.resolveTarget!({ to: 'hub:Neil' } as any);
    expect((result as any).to).toBe('Neil');
  });

  it("returns 'default' when to is empty", () => {
    const result = hubPlugin.outbound!.resolveTarget!({ to: '' } as any);
    expect((result as any).to).toBe('default');
  });
});
