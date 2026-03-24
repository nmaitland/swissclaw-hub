const { validateMessage, sanitizeString } = require('../../server/index');

describe('validateMessage', () => {
  it('accepts valid message with sender and content', () => {
    expect(validateMessage({ sender: 'Alice', content: 'Hello' })).toBe(true);
  });

  it('rejects null', () => {
    expect(validateMessage(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(validateMessage(undefined)).toBe(false);
  });

  it('rejects non-object', () => {
    expect(validateMessage('string')).toBe(false);
    expect(validateMessage(42)).toBe(false);
  });

  it('rejects missing sender', () => {
    expect(validateMessage({ content: 'Hello' })).toBe(false);
  });

  it('rejects missing content', () => {
    expect(validateMessage({ sender: 'Alice' })).toBe(false);
  });

  it('rejects empty sender', () => {
    expect(validateMessage({ sender: '', content: 'Hello' })).toBe(false);
  });

  it('rejects empty content', () => {
    expect(validateMessage({ sender: 'Alice', content: '' })).toBe(false);
  });

  it('rejects non-string sender', () => {
    expect(validateMessage({ sender: 123, content: 'Hello' })).toBe(false);
  });

  it('rejects non-string content', () => {
    expect(validateMessage({ sender: 'Alice', content: 123 })).toBe(false);
  });

  it('rejects content exceeding 5000 chars', () => {
    expect(validateMessage({ sender: 'Alice', content: 'x'.repeat(5001) })).toBe(false);
  });

  it('accepts content at exactly 5000 chars', () => {
    expect(validateMessage({ sender: 'Alice', content: 'x'.repeat(5000) })).toBe(true);
  });

  it('rejects sender exceeding 50 chars', () => {
    expect(validateMessage({ sender: 'x'.repeat(51), content: 'Hello' })).toBe(false);
  });

  it('accepts sender at exactly 50 chars', () => {
    expect(validateMessage({ sender: 'x'.repeat(50), content: 'Hello' })).toBe(true);
  });

  it('accepts valid message with optional conversationId', () => {
    expect(validateMessage({ sender: 'Alice', content: 'Hello', conversationId: 'user1:example.com' })).toBe(true);
  });

  it('accepts message without conversationId', () => {
    expect(validateMessage({ sender: 'Alice', content: 'Hello' })).toBe(true);
  });

  it('rejects non-string conversationId', () => {
    expect(validateMessage({ sender: 'Alice', content: 'Hello', conversationId: 123 })).toBe(false);
  });

  it('rejects conversationId exceeding 200 chars', () => {
    expect(validateMessage({ sender: 'Alice', content: 'Hello', conversationId: 'x'.repeat(201) })).toBe(false);
  });

  it('accepts conversationId at exactly 200 chars', () => {
    expect(validateMessage({ sender: 'Alice', content: 'Hello', conversationId: 'x'.repeat(200) })).toBe(true);
  });
});

describe('sanitizeString', () => {
  it('returns string unchanged when no angle brackets', () => {
    expect(sanitizeString('Hello world')).toBe('Hello world');
  });

  it('removes < characters', () => {
    expect(sanitizeString('Hello < world')).toBe('Hello  world');
  });

  it('removes > characters', () => {
    expect(sanitizeString('Hello > world')).toBe('Hello  world');
  });

  it('removes HTML tags', () => {
    expect(sanitizeString('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
  });

  it('handles empty string', () => {
    expect(sanitizeString('')).toBe('');
  });

  it('handles string with only angle brackets', () => {
    expect(sanitizeString('<><>')).toBe('');
  });

  it('preserves other special characters', () => {
    expect(sanitizeString('Hello & "world" \'test\'')).toBe('Hello & "world" \'test\'');
  });
});
