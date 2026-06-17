import { describe, it, expect } from 'vitest';
import {
  levenshteinDistance,
  fuzzyMatch,
  highlightText,
  formatContextSize,
  isModelLikelyFree,
} from '~/components/chat/modelSelectorUtils';
import type { ModelInfo } from '~/lib/modules/llm/types';

describe('modelSelectorUtils', () => {
  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
    });

    it('should return correct distance for single edit', () => {
      expect(levenshteinDistance('cat', 'car')).toBe(1);
    });

    it('should return correct distance for multiple edits', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    });

    it('should handle empty strings', () => {
      expect(levenshteinDistance('', 'abc')).toBe(3);
      expect(levenshteinDistance('abc', '')).toBe(3);
      expect(levenshteinDistance('', '')).toBe(0);
    });
  });

  describe('fuzzyMatch', () => {
    it('should match everything when query is empty', () => {
      const result = fuzzyMatch('', 'some text');
      expect(result.matches).toBe(true);
      expect(result.score).toBe(0);
    });

    it('should not match when text is empty', () => {
      const result = fuzzyMatch('query', '');
      expect(result.matches).toBe(false);
    });

    it('should give high score for exact substring match', () => {
      const result = fuzzyMatch('gpt', 'gpt-4-turbo');
      expect(result.matches).toBe(true);
      expect(result.score).toBeGreaterThan(80);
    });

    it('should give high score for substring at start', () => {
      const result = fuzzyMatch('claude', 'claude-3-opus');
      expect(result.matches).toBe(true);
      expect(result.score).toBeGreaterThan(90);
    });

    it('should not match totally different strings', () => {
      const result = fuzzyMatch('xyz', 'abcdefg');
      expect(result.matches).toBe(false);
    });
  });

  describe('highlightText', () => {
    it('should return original text when query is empty', () => {
      expect(highlightText('hello world', '')).toBe('hello world');
    });

    it('should wrap matches in mark tags', () => {
      const result = highlightText('hello world', 'world');
      expect(result).toContain('<mark');
      expect(result).toContain('world');
    });

    it('should be case-insensitive', () => {
      const result = highlightText('Hello World', 'hello');
      expect(result).toContain('<mark');
    });

    it('should escape regex special characters', () => {
      // Should not throw with special regex chars
      expect(() => highlightText('price $100', '$100')).not.toThrow();
    });
  });

  describe('formatContextSize', () => {
    it('should format millions', () => {
      expect(formatContextSize(1000000)).toBe('1.0M');
      expect(formatContextSize(2500000)).toBe('2.5M');
    });

    it('should format thousands', () => {
      expect(formatContextSize(128000)).toBe('128K');
      expect(formatContextSize(4000)).toBe('4K');
    });

    it('should return raw number for small values', () => {
      expect(formatContextSize(500)).toBe('500');
      expect(formatContextSize(0)).toBe('0');
    });
  });

  describe('isModelLikelyFree', () => {
    const createModel = (name: string, label: string): ModelInfo =>
      ({
        name,
        label,
        provider: 'test',
        maxTokenAllowed: 4096,
      }) as ModelInfo;

    it('should detect OpenRouter free models by pricing', () => {
      const model = createModel('meta/llama-3', 'Llama 3 (in:$0.00, out:$0.00)');
      expect(isModelLikelyFree(model, 'OpenRouter')).toBe(true);
    });

    it('should not flag OpenRouter models with non-zero pricing', () => {
      const model = createModel('openai/gpt-4', 'GPT-4 (in:$10.00, out:$30.00)');
      expect(isModelLikelyFree(model, 'OpenRouter')).toBe(false);
    });

    it('should detect models with "free" in the name', () => {
      const model = createModel('gemma-free', 'Gemma Free');
      expect(isModelLikelyFree(model)).toBe(true);
    });

    it('should not flag regular models as free', () => {
      const model = createModel('gpt-4', 'GPT-4 Turbo');
      expect(isModelLikelyFree(model)).toBe(false);
    });
  });
});
