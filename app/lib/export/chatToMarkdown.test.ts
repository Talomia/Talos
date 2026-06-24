import { describe, it, expect, vi } from 'vitest';
import { chatToMarkdown } from './chatToMarkdown';
import type { Message } from 'ai';

// Mock date-fns to avoid timezone-dependent test failures
vi.mock('date-fns', () => ({
  format: (date: Date, pattern: string) => {
    if (pattern === 'MMMM d, yyyy h:mm a') {
      return 'June 24, 2026 12:00 PM';
    }

    if (pattern === 'h:mm a') {
      return '12:00 PM';
    }

    if (pattern === 'yyyy-MM-dd') {
      return '2026-06-24';
    }

    return '';
  },
}));

describe('chatToMarkdown', () => {
  const makeMessage = (role: 'user' | 'assistant', content: string, opts?: Partial<Message>): Message =>
    ({
      id: `msg-${Math.random().toString(36).slice(2)}`,
      role,
      content,
      ...opts,
    }) as Message;

  it('produces valid markdown with header', () => {
    const messages = [makeMessage('user', 'Hello'), makeMessage('assistant', 'Hi there!')];
    const result = chatToMarkdown(messages, 'Test Chat');

    expect(result).toContain('# Test Chat');
    expect(result).toContain('Exported from Talos on');
    expect(result).toContain('---');
  });

  it('uses default title when none provided', () => {
    const result = chatToMarkdown([makeMessage('user', 'Hello')]);

    expect(result).toContain('# Chat Conversation');
  });

  it('formats user messages with 👤 emoji', () => {
    const result = chatToMarkdown([makeMessage('user', 'Hello')]);

    expect(result).toContain('## 👤 You');
    expect(result).toContain('Hello');
  });

  it('formats assistant messages with 🤖 emoji', () => {
    const result = chatToMarkdown([makeMessage('assistant', 'Hi!')]);

    expect(result).toContain('## 🤖 Assistant');
    expect(result).toContain('Hi!');
  });

  it('strips model and provider metadata', () => {
    const content = '[Model: gpt-4o]\n\n[Provider: openai]\n\nActual content';
    const result = chatToMarkdown([makeMessage('assistant', content)]);

    expect(result).toContain('Actual content');
    expect(result).not.toContain('[Model:');
    expect(result).not.toContain('[Provider:');
  });

  it('skips hidden messages', () => {
    const messages = [
      makeMessage('user', 'Hello'),
      makeMessage('assistant', 'Hidden', { annotations: ['hidden'] as any }),
      makeMessage('assistant', 'Visible'),
    ];
    const result = chatToMarkdown(messages);

    expect(result).not.toContain('Hidden');
    expect(result).toContain('Visible');
  });

  it('skips messages that become empty after metadata stripping', () => {
    const messages = [makeMessage('assistant', '[Model: gpt-4o]\n\n[Provider: openai]')];
    const result = chatToMarkdown(messages);

    // Should not have role heading for empty content
    expect(result).not.toContain('## 🤖 Assistant');
  });

  it('handles array content (v6 format)', () => {
    const messages = [
      makeMessage('assistant', [
        { type: 'text', text: 'Part 1' },
        { type: 'text', text: 'Part 2' },
      ] as any),
    ];
    const result = chatToMarkdown(messages);

    expect(result).toContain('Part 1');
    expect(result).toContain('Part 2');
  });

  it('includes timestamps when available', () => {
    const messages = [makeMessage('user', 'Hello', { createdAt: new Date('2026-06-24T12:00:00Z') })];
    const result = chatToMarkdown(messages);

    expect(result).toContain('12:00 PM');
  });

  it('handles messages with invalid dates gracefully', () => {
    const messages = [makeMessage('user', 'Hello', { createdAt: new Date('invalid') })];
    const result = chatToMarkdown(messages);

    // Should still contain the message, just without a timestamp
    expect(result).toContain('Hello');
  });

  it('returns header-only for empty messages', () => {
    const result = chatToMarkdown([]);

    expect(result).toContain('# Chat Conversation');
    expect(result).not.toContain('## 👤');
    expect(result).not.toContain('## 🤖');
  });
});
