import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as fs from 'node:fs';
import { loadHubToken, ensureHubAuth } from '../../openclaw-extension/src/auth';

jest.mock('node:fs');
jest.mock('../../openclaw-extension/src/credentials', () => ({
  loadCredentials: jest.fn<() => Promise<{ username: string; password: string }>>()
    .mockResolvedValue({ username: 'testuser', password: 'testpass' }),
}));

const mockFs = fs as jest.Mocked<typeof fs>;

beforeEach(() => { jest.clearAllMocks(); });

describe('loadHubToken', () => {
  it('returns null when token file does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(loadHubToken()).toBeNull();
  });

  it('returns token from file when present', () => {
    mockFs.existsSync.mockReturnValue(true);
    (mockFs.readFileSync as jest.Mock).mockReturnValue('my-token\n');
    expect(loadHubToken()).toBe('my-token');
  });

  it('returns null when file contains only whitespace', () => {
    mockFs.existsSync.mockReturnValue(true);
    (mockFs.readFileSync as jest.Mock).mockReturnValue('   ');
    expect(loadHubToken()).toBeNull();
  });

  it('returns null when reading the file throws', () => {
    mockFs.existsSync.mockReturnValue(true);
    (mockFs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('permission denied');
    });
    expect(loadHubToken()).toBeNull();
  });
});

describe('ensureHubAuth', () => {
  const HUB_URL = 'https://hub.example.com';

  it('returns cached token when it validates successfully', async () => {
    mockFs.existsSync.mockReturnValue(true);
    (mockFs.readFileSync as jest.Mock).mockReturnValue('cached-token');
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({ status: 200 } as Response);

    const token = await ensureHubAuth(HUB_URL);
    expect(token).toBe('cached-token');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0]![0]).toContain('/api/status');
  });

  it('logs in when no cached token exists', async () => {
    mockFs.existsSync.mockReturnValue(false);
    (mockFs.writeFileSync as jest.Mock).mockImplementation(() => {});
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'new-token' }),
    } as Response);

    const token = await ensureHubAuth(HUB_URL);
    expect(token).toBe('new-token');
    expect((global.fetch as jest.Mock).mock.calls[0]![0]).toContain('/api/login');
  });

  it('logs in when cached token fails validation', async () => {
    mockFs.existsSync.mockReturnValue(true);
    (mockFs.readFileSync as jest.Mock).mockReturnValue('stale-token');
    (mockFs.unlinkSync as jest.Mock).mockImplementation(() => {});
    (mockFs.writeFileSync as jest.Mock).mockImplementation(() => {});
    global.fetch = jest.fn<typeof fetch>()
      .mockResolvedValueOnce({ status: 401 } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'fresh-token' }) } as Response);

    const token = await ensureHubAuth(HUB_URL);
    expect(token).toBe('fresh-token');
  });

  it('skips validation and forces login when forceLogin is true', async () => {
    mockFs.existsSync.mockReturnValue(true);
    (mockFs.readFileSync as jest.Mock).mockReturnValue('cached-token');
    (mockFs.unlinkSync as jest.Mock).mockImplementation(() => {});
    (mockFs.writeFileSync as jest.Mock).mockImplementation(() => {});
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'forced-token' }),
    } as Response);

    const token = await ensureHubAuth(HUB_URL, true);
    expect(token).toBe('forced-token');
    expect((global.fetch as jest.Mock).mock.calls[0]![0]).toContain('/api/login');
  });

  it('throws when login returns an error response', async () => {
    mockFs.existsSync.mockReturnValue(false);
    global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid credentials' }),
    } as Response);

    await expect(ensureHubAuth(HUB_URL)).rejects.toThrow('Hub login failed: Invalid credentials');
  });
});
