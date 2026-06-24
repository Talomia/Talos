import { describe, it, expect } from 'vitest';
import { chatToJSON } from './chatToJSON';
import type { Message } from 'ai';

describe('chatToJSON', () => {
  const makeMessage = (role: 'user' | 'assistant', content: string, opts?: Partial<Message>): Message =>
    ({
      id: `msg-${Math.random().toString(36).slice(2)}`,
      role,
      content,
      ...opts,
    }) as Message;

  it('returns valid export structure with version and source', () => {
    const messages = [makeMessage('user', 'Hello'), makeMessage('assistant', 'Hi there!')];
    const result = chatToJSON(messages, 'Test Chat');

    expect(result.version).toBe(1);
    expect(result.source).toBe('talos');
    expect(result.chat.title).toBe('Test Chat');
    expect(result.chat.messageCount).toBe(2);
    expect(result.exportedAt).toBeDefined();
    expect(new Date(result.exportedAt).getTime()).not.toBeNaN();
  });

  it('uses default title when none provided', () => {
    const result = chatToJSON([makeMessage('user', 'Hi')]);

    expect(result.chat.title).toBe('Untitled Chat');
  });

  it('strips model and provider metadata from messages', () => {
    const content = '[Model: gpt-4o]\n\n[Provider: openai]\n\nActual response content';
    const messages = [makeMessage('assistant', content)];
    const result = chatToJSON(messages);

    expect(result.messages[0].content).toBe('Actual response content');
  });

  it('skips messages with hidden annotations', () => {
    const messages = [
      makeMessage('user', 'Hello'),
      makeMessage('assistant', 'Hidden', { annotations: ['hidden'] as any }),
      makeMessage('assistant', 'Visible'),
    ];
    const result = chatToJSON(messages);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].content).toBe('Hello');
    expect(result.messages[1].content).toBe('Visible');
  });

  it('skips messages that become empty after metadata stripping', () => {
    const messages = [makeMessage('user', '[Model: gpt-4o]\n\n[Provider: openai]')];
    const result = chatToJSON(messages);

    expect(result.messages).toHaveLength(0);
    expect(result.chat.messageCount).toBe(0);
  });

  it('handles array content (v6 message format)', () => {
    const messages = [
      makeMessage('assistant', [
        { type: 'text', text: 'Response part 1' },
        { type: 'text', text: 'Response part 2' },
      ] as any),
    ];
    const result = chatToJSON(messages);

    expect(result.messages[0].content).toBe('Response part 1\nResponse part 2');
  });

  it('preserves valid timestamps', () => {
    const date = new Date('2026-06-24T12:00:00Z');
    const messages = [makeMessage('user', 'Hello', { createdAt: date })];
    const result = chatToJSON(messages);

    expect(result.messages[0].createdAt).toBe(date.toISOString());
  });

  it('omits invalid timestamps', () => {
    const messages = [makeMessage('user', 'Hello', { createdAt: new Date('invalid') })];
    const result = chatToJSON(messages);

    expect(result.messages[0].createdAt).toBeUndefined();
  });

  it('returns empty messages array for empty input', () => {
    const result = chatToJSON([]);

    expect(result.messages).toHaveLength(0);
    expect(result.chat.messageCount).toBe(0);
  });
});
