/**
 * Token Cost Estimator — LLM Usage Tracking & Budget
 * =====================================================
 * Tracks token usage across providers and models, estimates costs,
 * and provides budget alerts. Data is persisted to localStorage
 * and optionally synced to cloud.
 *
 * Pricing data is embedded (no external API needed) and covers
 * major providers. Users can set monthly budget limits.
 */

import { atom, computed, map } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
import { safeSetItem } from '~/utils/safeStorage';

const logger = createScopedLogger('token-cost');

/*
 * ==========================================
 * Pricing Data (per 1M tokens, USD)
 * ==========================================
 */

interface ModelPricing {
  /** Cost per 1M input tokens (USD). */
  input: number;

  /** Cost per 1M output tokens (USD). */
  output: number;
}

/**
 * Embedded pricing for common models.
 * Updated: June 2026. Prices in USD per 1M tokens.
 * Zero-cost entries indicate free/local models.
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10, output: 30 },
  o1: { input: 15, output: 60 },
  'o1-mini': { input: 3, output: 12 },
  'o3-mini': { input: 1.1, output: 4.4 },

  // Anthropic
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
  'claude-3-opus-20240229': { input: 15, output: 75 },

  // Google
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-1.5-pro': { input: 1.25, output: 5 },

  // Groq (effectively free tier)
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },

  // DeepSeek
  'deepseek-chat': { input: 0.27, output: 1.1 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },

  // Mistral
  'mistral-large-latest': { input: 2, output: 6 },
  'codestral-latest': { input: 0.3, output: 0.9 },

  // Local models (free)
  local: { input: 0, output: 0 },
};

/*
 * ==========================================
 * Types
 * ==========================================
 */

export interface TokenUsageRecord {
  /** ISO date (YYYY-MM-DD) for daily aggregation. */
  date: string;

  /** Provider name. */
  provider: string;

  /** Model name. */
  model: string;

  /** Total input tokens for this day+model combination. */
  inputTokens: number;

  /** Total output tokens for this day+model combination. */
  outputTokens: number;

  /** Estimated cost in USD. */
  estimatedCost: number;

  /** Number of requests. */
  requestCount: number;
}

export interface BudgetConfig {
  /** Monthly budget limit in USD. 0 = unlimited. */
  monthlyLimitUsd: number;

  /** Warning threshold as percentage (0-100). Default: 80. */
  warningThresholdPercent: number;

  /** Whether budget alerts are enabled. */
  alertsEnabled: boolean;
}

export interface UsageSummary {
  /** Total cost this month (USD). */
  monthlyTotalUsd: number;

  /** Total cost today (USD). */
  dailyTotalUsd: number;

  /** Total input tokens this month. */
  monthlyInputTokens: number;

  /** Total output tokens this month. */
  monthlyOutputTokens: number;

  /** Total requests this month. */
  monthlyRequests: number;

  /** Cost by provider this month. */
  costByProvider: Record<string, number>;

  /** Cost by model this month. */
  costByModel: Record<string, number>;

  /** Daily cost for the current month (for chart). */
  dailyCosts: Array<{ date: string; cost: number }>;

  /** Budget status. */
  budgetStatus: 'ok' | 'warning' | 'exceeded' | 'unlimited';

  /** Percentage of budget used. */
  budgetUsedPercent: number;
}

/*
 * ==========================================
 * Storage
 * ==========================================
 */

const USAGE_STORAGE_KEY = 'app_token_usage';
const BUDGET_STORAGE_KEY = 'app_token_budget';

function loadUsageRecords(): TokenUsageRecord[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = localStorage.getItem(USAGE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUsageRecords(records: TokenUsageRecord[]): void {
  // Keep only last 90 days to prevent unbounded growth
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const cutoffStr = cutoff.toISOString().split('T')[0];

  const trimmed = records.filter((r) => r.date >= cutoffStr);
  safeSetItem(USAGE_STORAGE_KEY, JSON.stringify(trimmed));
}

function loadBudgetConfig(): BudgetConfig {
  if (typeof window === 'undefined') {
    return { monthlyLimitUsd: 0, warningThresholdPercent: 80, alertsEnabled: true };
  }

  try {
    const raw = localStorage.getItem(BUDGET_STORAGE_KEY);
    return raw ? JSON.parse(raw) : { monthlyLimitUsd: 0, warningThresholdPercent: 80, alertsEnabled: true };
  } catch {
    return { monthlyLimitUsd: 0, warningThresholdPercent: 80, alertsEnabled: true };
  }
}

/*
 * ==========================================
 * Reactive State
 * ==========================================
 */

export const usageRecords = atom<TokenUsageRecord[]>(loadUsageRecords());
export const budgetConfig = map<BudgetConfig>(loadBudgetConfig());

/** Computed usage summary for the current month. */
export const usageSummary = computed([usageRecords, budgetConfig], (records, budget): UsageSummary => {
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const today = now.toISOString().split('T')[0];

  const monthRecords = records.filter((r) => r.date.startsWith(monthPrefix));
  const todayRecords = records.filter((r) => r.date === today);

  const monthlyTotalUsd = monthRecords.reduce((sum, r) => sum + r.estimatedCost, 0);
  const dailyTotalUsd = todayRecords.reduce((sum, r) => sum + r.estimatedCost, 0);
  const monthlyInputTokens = monthRecords.reduce((sum, r) => sum + r.inputTokens, 0);
  const monthlyOutputTokens = monthRecords.reduce((sum, r) => sum + r.outputTokens, 0);
  const monthlyRequests = monthRecords.reduce((sum, r) => sum + r.requestCount, 0);

  // Cost by provider
  const costByProvider: Record<string, number> = {};

  for (const r of monthRecords) {
    costByProvider[r.provider] = (costByProvider[r.provider] ?? 0) + r.estimatedCost;
  }

  // Cost by model
  const costByModel: Record<string, number> = {};

  for (const r of monthRecords) {
    costByModel[r.model] = (costByModel[r.model] ?? 0) + r.estimatedCost;
  }

  // Daily costs for chart
  const dailyCostMap: Record<string, number> = {};

  for (const r of monthRecords) {
    dailyCostMap[r.date] = (dailyCostMap[r.date] ?? 0) + r.estimatedCost;
  }

  const dailyCosts = Object.entries(dailyCostMap)
    .map(([date, cost]) => ({ date, cost }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Budget status
  let budgetStatus: UsageSummary['budgetStatus'] = 'unlimited';
  let budgetUsedPercent = 0;

  if (budget.monthlyLimitUsd > 0) {
    budgetUsedPercent = (monthlyTotalUsd / budget.monthlyLimitUsd) * 100;

    if (budgetUsedPercent >= 100) {
      budgetStatus = 'exceeded';
    } else if (budgetUsedPercent >= budget.warningThresholdPercent) {
      budgetStatus = 'warning';
    } else {
      budgetStatus = 'ok';
    }
  }

  return {
    monthlyTotalUsd,
    dailyTotalUsd,
    monthlyInputTokens,
    monthlyOutputTokens,
    monthlyRequests,
    costByProvider,
    costByModel,
    dailyCosts,
    budgetStatus,
    budgetUsedPercent,
  };
});

/*
 * ==========================================
 * Actions
 * ==========================================
 */

/**
 * Record token usage from an LLM response.
 * Call this after each successful LLM interaction.
 */
export function recordUsage(params: {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): void {
  const today = new Date().toISOString().split('T')[0];
  const records = usageRecords.get();

  // Find existing record for today + model + provider
  const existingIndex = records.findIndex(
    (r) => r.date === today && r.provider === params.provider && r.model === params.model,
  );

  const cost = estimateCost(params.model, params.inputTokens, params.outputTokens);

  if (existingIndex >= 0) {
    // Update existing record
    const updated = [...records];
    updated[existingIndex] = {
      ...updated[existingIndex],
      inputTokens: updated[existingIndex].inputTokens + params.inputTokens,
      outputTokens: updated[existingIndex].outputTokens + params.outputTokens,
      estimatedCost: updated[existingIndex].estimatedCost + cost,
      requestCount: updated[existingIndex].requestCount + 1,
    };
    usageRecords.set(updated);
    saveUsageRecords(updated);
  } else {
    // Create new record
    const newRecord: TokenUsageRecord = {
      date: today,
      provider: params.provider,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      estimatedCost: cost,
      requestCount: 1,
    };
    const updated = [...records, newRecord];
    usageRecords.set(updated);
    saveUsageRecords(updated);
  }

  logger.debug(
    `Recorded usage: ${params.provider}/${params.model} — ` +
      `${params.inputTokens}in/${params.outputTokens}out — $${cost.toFixed(4)}`,
  );
}

/**
 * Estimate the cost for a given token count.
 */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = getModelPricing(model);

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  return inputCost + outputCost;
}

/**
 * Get pricing for a model. Falls back to GPT-4o-mini pricing if unknown.
 */
export function getModelPricing(model: string): ModelPricing {
  // Try exact match first
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model];
  }

  // Try partial match (model names often have version suffixes)
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(key) || model.includes(key)) {
      return pricing;
    }
  }

  // Local/unknown models default to free
  if (model.startsWith('local') || model.startsWith('ollama')) {
    return { input: 0, output: 0 };
  }

  // Default: conservative GPT-4o-mini pricing
  return MODEL_PRICING['gpt-4o-mini'] ?? { input: 0.15, output: 0.6 };
}

/**
 * Update the budget configuration.
 */
export function updateBudget(config: Partial<BudgetConfig>): void {
  const current = budgetConfig.get();
  const updated = { ...current, ...config };
  budgetConfig.set(updated);
  safeSetItem(BUDGET_STORAGE_KEY, JSON.stringify(updated));
}

/**
 * Clear all usage history.
 */
export function clearUsageHistory(): void {
  usageRecords.set([]);
  saveUsageRecords([]);
}

/**
 * Export usage data as CSV.
 */
export function exportUsageCSV(): string {
  const records = usageRecords.get();
  const headers = ['Date', 'Provider', 'Model', 'Input Tokens', 'Output Tokens', 'Est. Cost (USD)', 'Requests'];
  const rows = records.map((r) => [
    r.date,
    r.provider,
    r.model,
    r.inputTokens.toString(),
    r.outputTokens.toString(),
    r.estimatedCost.toFixed(4),
    r.requestCount.toString(),
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
