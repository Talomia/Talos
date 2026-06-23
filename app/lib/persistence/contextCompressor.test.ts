import { describe, it, expect, vi } from 'vitest';
import { analyzeContext, compressContext, getCompressionStats } from './contextCompressor';

// Suppress logger output during tests
vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }),
}));

/*
 * ==========================================
 * Helpers
 * ==========================================
 */

/** Generate N filler messages, each with ~longContentLen chars. */
function makeMessages(count: number, contentLen = 100): Array<{ role: string; content: string }> {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i}: ${'x'.repeat(contentLen)}`,
  }));
}

/**
 * Generate a large set of messages whose token estimate is
 * guaranteed to exceed the default 100 000-token threshold.
 * Each message ≈ 1 600 chars ≈ ~420 tokens → 300 msgs ≈ 126 000 tokens.
 */
function makeLargeConversation(): Array<{ role: string; content: string }> {
  return makeMessages(300, 1600);
}

/*
 * ==========================================
 * analyzeContext
 * ==========================================
 */

describe('analyzeContext', () => {
  it('reports no compression needed when below threshold', () => {
    const messages = makeMessages(5, 50);
    const result = analyzeContext(messages);
    expect(result.needsCompression).toBe(false);
    expect(result.estimatedTokens).toBeGreaterThan(0);
    expect(result.messageTokens).toBeGreaterThan(0);
  });

  it('reports no compression when message count is below minMessagesForCompression', () => {
    // Even if tokens are high, fewer than 30 messages should not trigger compression
    const messages = makeMessages(10, 10000);
    const result = analyzeContext(messages);
    expect(result.needsCompression).toBe(false);
  });

  it('reports compression needed when above threshold', () => {
    const messages = makeLargeConversation();
    const result = analyzeContext(messages);
    expect(result.needsCompression).toBe(true);
    expect(result.estimatedTokens).toBeGreaterThan(100_000);
  });

  it('includes file tokens when files are provided', () => {
    const messages = makeMessages(2, 10);
    const files = { 'big.ts': 'x'.repeat(5000) };
    const withFiles = analyzeContext(messages, files);
    const withoutFiles = analyzeContext(messages);
    expect(withFiles.fileTokens).toBeGreaterThan(0);
    expect(withFiles.estimatedTokens).toBeGreaterThan(withoutFiles.estimatedTokens);
  });
});

/*
 * ==========================================
 * compressContext
 * ==========================================
 */

describe('compressContext', () => {
  it('returns uncompressed result for a small conversation', () => {
    const messages = makeMessages(5, 50);
    const result = compressContext(messages);
    expect(result.wasCompressed).toBe(false);
    expect(result.summary).toBe('');
    expect(result.recentMessages).toEqual(messages);
    expect(result.summarizedMessageCount).toBe(0);
  });

  it('compresses a large conversation', () => {
    const messages = makeLargeConversation();
    const result = compressContext(messages);
    expect(result.wasCompressed).toBe(true);
    expect(result.summarizedMessageCount).toBeGreaterThan(0);
    expect(result.recentMessages.length).toBeLessThanOrEqual(20); // default recentWindowSize
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.estimatedTokens).toBeLessThan(result.originalMessageCount * 500); // significantly smaller
  });

  it('summary includes user requests', () => {
    // Build messages that have recognizable user content
    const msgs: Array<{ role: string; content: string }> = [];

    for (let i = 0; i < 300; i++) {
      if (i % 2 === 0) {
        msgs.push({ role: 'user', content: `Please implement the authentication module ${'x'.repeat(1600)}` });
      } else {
        msgs.push({ role: 'assistant', content: `Sure, I'll implement that now ${'x'.repeat(1600)}` });
      }
    }

    const result = compressContext(msgs);
    expect(result.wasCompressed).toBe(true);
    expect(result.summary).toContain('User requests');
    expect(result.summary).toContain('authentication module');
  });

  it('summary mentions file changes when present', () => {
    const msgs: Array<{ role: string; content: string }> = [];

    for (let i = 0; i < 300; i++) {
      if (i % 2 === 0) {
        msgs.push({ role: 'user', content: `Update the config file ${'x'.repeat(1600)}` });
      } else {
        msgs.push({
          role: 'assistant',
          content: `I'll update it now title="src/config.ts" type="file" ${'x'.repeat(1600)}`,
        });
      }
    }

    const result = compressContext(msgs);
    expect(result.wasCompressed).toBe(true);
    expect(result.summary).toContain('Files modified');
    expect(result.summary).toContain('src/config.ts');
  });

  it('respects custom recentWindowSize', () => {
    const messages = makeLargeConversation();
    const result = compressContext(messages, { recentWindowSize: 5 });
    expect(result.wasCompressed).toBe(true);
    expect(result.recentMessages).toHaveLength(5);
  });
});

/*
 * ==========================================
 * getCompressionStats
 * ==========================================
 */

describe('getCompressionStats', () => {
  it('returns zero reduction when compression not needed', () => {
    const messages = makeMessages(5, 50);
    const stats = getCompressionStats(messages);
    expect(stats.needsCompression).toBe(false);
    expect(stats.reductionPercent).toBe(0);
    expect(stats.messagesSummarized).toBe(0);
    expect(stats.tokensBefore).toBe(stats.tokensAfter);
  });

  it('returns positive reduction for a large conversation', () => {
    const messages = makeLargeConversation();
    const stats = getCompressionStats(messages);
    expect(stats.needsCompression).toBe(true);
    expect(stats.reductionPercent).toBeGreaterThan(0);
    expect(stats.messagesSummarized).toBeGreaterThan(0);
    expect(stats.tokensAfter).toBeLessThan(stats.tokensBefore);
  });
});
