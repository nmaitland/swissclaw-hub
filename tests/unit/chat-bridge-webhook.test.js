process.env.SWISSCLAW_HUB_URL = process.env.SWISSCLAW_HUB_URL || 'http://localhost:3000';
const { handleInboundMessage } = require('../../scripts/chat-bridge-webhook');

describe('chat bridge inbound dedupe handling', () => {
  const hooksToken = 'test-hooks-token';
  const message = {
    id: 123,
    sender: 'Neil',
    content: 'Hello',
    created_at: '2026-02-25T20:00:00.000Z',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips self-sent messages without claiming or forwarding', async () => {
    const request = jest.fn();
    const forward = jest.fn();

    const result = await handleInboundMessage(
      { ...message, sender: 'Swissclaw' },
      hooksToken,
      { request },
      forward
    );

    expect(result).toBe('skipped-self');
    expect(request).not.toHaveBeenCalled();
    expect(forward).not.toHaveBeenCalled();
  });

  it('skips webhook forward when claim returns claimed=false', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const request = jest.fn().mockResolvedValue({
      id: message.id,
      state: 'received',
      updatedAt: '2026-02-25T20:00:01.000Z',
      claimed: false,
    });
    const forward = jest.fn();

    const result = await handleInboundMessage(message, hooksToken, { request }, forward);

    expect(result).toBe('skipped-duplicate');
    expect(request).toHaveBeenCalledTimes(1);
    expect(forward).not.toHaveBeenCalled();
  });

  it('forwards when claim succeeds', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const request = jest.fn().mockResolvedValue({
      id: message.id,
      state: 'received',
      updatedAt: '2026-02-25T20:00:01.000Z',
      claimed: true,
    });
    const forward = jest.fn().mockResolvedValue(undefined);
    const client = { request };

    const result = await handleInboundMessage(message, hooksToken, client, forward);

    expect(result).toBe('forwarded');
    expect(forward).toHaveBeenCalledTimes(1);
    expect(forward).toHaveBeenCalledWith(message, hooksToken, client);
  });
});

