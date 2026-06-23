import { describe, it, expect, vi, beforeEach } from 'vitest';
import { estimateCost, getModelPricing, exportUsageCSV, usageRecords, clearUsageHistory } from './tokenCost';

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

// Mock safeStorage to avoid localStorage dependency
vi.mock('~/utils/safeStorage', () => ({
  safeSetItem: vi.fn(),
}));

/*
 * ==========================================
 * estimateCost
 * ==========================================
 */

describe('estimateCost', () => {
  it('calculates cost for a known model (gpt-4o)', () => {
    // gpt-4o: $2.5/1M input, $10/1M output
    const cost = estimateCost('gpt-4o', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(2.5 + 10, 2);
  });

  it('calculates cost for small token counts', () => {
    // gpt-4o: 1000 input tokens, 500 output tokens
    const cost = estimateCost('gpt-4o', 1000, 500);
    const expected = (1000 / 1_000_000) * 2.5 + (500 / 1_000_000) * 10;
    expect(cost).toBeCloseTo(expected, 6);
  });

  it('falls back to gpt-4o-mini pricing for unknown models', () => {
    // Unknown model should use gpt-4o-mini: $0.15/1M input, $0.6/1M output
    const cost = estimateCost('some-unknown-model-xyz', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(0.15 + 0.6, 2);
  });

  it('returns zero for local models', () => {
    const cost = estimateCost('local', 10_000, 5_000);
    expect(cost).toBe(0);
  });

  it('returns zero for ollama models', () => {
    const cost = estimateCost('ollama/llama3', 10_000, 5_000);
    expect(cost).toBe(0);
  });
});

/*
 * ==========================================
 * getModelPricing
 * ==========================================
 */

describe('getModelPricing', () => {
  it('returns exact match pricing', () => {
    const pricing = getModelPricing('gpt-4o');
    expect(pricing.input).toBe(2.5);
    expect(pricing.output).toBe(10);
  });

  it('matches partial model names (version suffix)', () => {
    // 'claude-sonnet-4-20250514' is in the table; a string starting with it should match
    const pricing = getModelPricing('claude-sonnet-4-20250514');
    expect(pricing.input).toBe(3);
    expect(pricing.output).toBe(15);
  });

  it('falls back to gpt-4o-mini for completely unknown models', () => {
    const pricing = getModelPricing('totally-made-up-model');
    expect(pricing.input).toBe(0.15);
    expect(pricing.output).toBe(0.6);
  });

  it('returns free pricing for local prefix', () => {
    const pricing = getModelPricing('local-llama');
    expect(pricing.input).toBe(0);
    expect(pricing.output).toBe(0);
  });
});

/*
 * ==========================================
 * exportUsageCSV
 * ==========================================
 */

describe('exportUsageCSV', () => {
  beforeEach(() => {
    clearUsageHistory();
  });

  it('produces correct CSV headers when no records exist', () => {
    const csv = exportUsageCSV();
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Date,Provider,Model,Input Tokens,Output Tokens,Est. Cost (USD),Requests');
    expect(lines).toHaveLength(1); // header only
  });

  it('produces correct CSV rows for existing records', () => {
    // Manually inject records for testing
    usageRecords.set([
      {
        date: '2026-06-23',
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 5000,
        outputTokens: 2000,
        estimatedCost: 0.0325,
        requestCount: 3,
      },
    ]);

    const csv = exportUsageCSV();
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2); // header + 1 row
    expect(lines[1]).toBe('2026-06-23,openai,gpt-4o,5000,2000,0.0325,3');

    // Clean up
    clearUsageHistory();
  });

  it('includes multiple rows for multiple records', () => {
    usageRecords.set([
      {
        date: '2026-06-22',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
        estimatedCost: 0.0105,
        requestCount: 1,
      },
      {
        date: '2026-06-23',
        provider: 'openai',
        model: 'gpt-4o',
        inputTokens: 3000,
        outputTokens: 1000,
        estimatedCost: 0.0175,
        requestCount: 2,
      },
    ]);

    const csv = exportUsageCSV();
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3); // header + 2 rows

    // Clean up
    clearUsageHistory();
  });
});
