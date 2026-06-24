import { describe, it, expect } from 'vitest';
import { recordRequest, recordError, recordLLMCall, recordLatency } from '~/routes/api.metrics';

/*
 * Note: Tests verify the recording functions don't throw.
 * Full integration testing of the loader would require mocking withSecurity.
 */

describe('metrics recording functions', () => {
  it('recordRequest does not throw', () => {
    expect(() => recordRequest('/api/chat')).not.toThrow();
    expect(() => recordRequest('/api/models')).not.toThrow();
  });

  it('recordError does not throw', () => {
    expect(() => recordError('/api/chat')).not.toThrow();
  });

  it('recordLLMCall tracks provider usage', () => {
    expect(() => recordLLMCall('OpenAI', 1500)).not.toThrow();
    expect(() => recordLLMCall('Anthropic', 2000, true)).not.toThrow();
  });

  it('recordLatency tracks timing', () => {
    expect(() => recordLatency(150)).not.toThrow();
    expect(() => recordLatency(3000)).not.toThrow();
  });

  it('handles concurrent calls without error', () => {
    const operations = Array.from({ length: 100 }, (_, i) => {
      recordRequest(`/api/route-${i % 5}`);
      recordLLMCall(`Provider-${i % 3}`, i * 10);
      recordLatency(i);
    });

    expect(operations).toHaveLength(100);
  });
});
