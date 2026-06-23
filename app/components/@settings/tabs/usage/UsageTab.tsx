/**
 * UsageTab — Token Usage Dashboard
 * ==================================
 * Shows token usage, costs, budget tracking, and usage history.
 * Integrated into the Settings panel.
 */

import { memo, useState, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { usageSummary, budgetConfig, updateBudget, clearUsageHistory, exportUsageCSV } from '~/lib/stores/tokenCost';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';

export const UsageTab = memo(() => {
  const summary = useStore(usageSummary);
  const budget = useStore(budgetConfig);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');

  const handleExportCSV = useCallback(() => {
    const csv = exportUsageCSV();

    if (!csv) {
      toast.info('No usage data to export');
      return;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `talos-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Usage data exported');
  }, []);

  const handleClearHistory = useCallback(() => {
    if (window.confirm('Clear all usage history? This cannot be undone.')) {
      clearUsageHistory();
      toast.success('Usage history cleared');
    }
  }, []);

  const handleSaveBudget = useCallback(() => {
    const limit = parseFloat(budgetInput);

    if (isNaN(limit) || limit < 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    updateBudget({ monthlyLimitUsd: limit });
    setEditingBudget(false);
    toast.success(limit > 0 ? `Budget set to $${limit.toFixed(2)}/month` : 'Budget limit removed');
  }, [budgetInput]);

  const totalTokens = summary.monthlyInputTokens + summary.monthlyOutputTokens;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="Monthly Cost"
          value={formatCost(summary.monthlyTotalUsd)}
          icon="i-ph:currency-dollar"
          accent={summary.budgetStatus === 'exceeded' ? 'red' : summary.budgetStatus === 'warning' ? 'amber' : 'green'}
        />
        <SummaryCard label="Today" value={formatCost(summary.dailyTotalUsd)} icon="i-ph:calendar" accent="blue" />
        <SummaryCard label="Tokens" value={formatTokens(totalTokens)} icon="i-ph:hash" accent="purple" />
        <SummaryCard
          label="Requests"
          value={summary.monthlyRequests.toLocaleString()}
          icon="i-ph:arrow-up-right"
          accent="cyan"
        />
      </div>

      {/* Budget Section */}
      <div className="rounded-lg border border-ui-borderColor bg-ui-background-depth-2 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-ui-textPrimary flex items-center gap-2">
            <span className="i-ph:target text-sm" />
            Monthly Budget
          </h3>
          <button
            onClick={() => {
              setBudgetInput(budget.monthlyLimitUsd > 0 ? budget.monthlyLimitUsd.toString() : '');
              setEditingBudget(!editingBudget);
            }}
            className="text-xs text-purple-500 hover:text-purple-400 transition-colors"
          >
            {editingBudget ? 'Cancel' : 'Edit'}
          </button>
        </div>

        {editingBudget ? (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-ui-textTertiary">$</span>
              <input
                type="number"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full pl-6 pr-3 py-1.5 text-sm bg-ui-background-depth-3 border border-ui-borderColor rounded text-ui-textPrimary focus:outline-none focus:border-purple-400"
              />
            </div>
            <button
              onClick={handleSaveBudget}
              className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded hover:bg-purple-500 transition-colors"
            >
              Save
            </button>
          </div>
        ) : (
          <>
            {budget.monthlyLimitUsd > 0 ? (
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-ui-textSecondary">
                    {formatCost(summary.monthlyTotalUsd)} of ${budget.monthlyLimitUsd.toFixed(2)}
                  </span>
                  <span
                    className={classNames('font-medium', {
                      'text-green-500': summary.budgetStatus === 'ok',
                      'text-amber-500': summary.budgetStatus === 'warning',
                      'text-red-500': summary.budgetStatus === 'exceeded',
                    })}
                  >
                    {summary.budgetUsedPercent.toFixed(0)}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-ui-background-depth-3 overflow-hidden">
                  <div
                    className={classNames('h-full rounded-full transition-all duration-500', {
                      'bg-green-500': summary.budgetStatus === 'ok',
                      'bg-amber-500': summary.budgetStatus === 'warning',
                      'bg-red-500': summary.budgetStatus === 'exceeded',
                    })}
                    style={{ width: `${Math.min(100, summary.budgetUsedPercent)}%` }}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-ui-textTertiary">No budget limit set. Click Edit to set one.</p>
            )}
          </>
        )}
      </div>

      {/* Usage by Provider */}
      {Object.keys(summary.costByProvider).length > 0 && (
        <div className="rounded-lg border border-ui-borderColor bg-ui-background-depth-2 p-4">
          <h3 className="text-sm font-medium text-ui-textPrimary mb-3 flex items-center gap-2">
            <span className="i-ph:cloud text-sm" />
            Cost by Provider
          </h3>
          <div className="space-y-2">
            {Object.entries(summary.costByProvider)
              .sort(([, a], [, b]) => b - a)
              .map(([provider, cost]) => {
                const maxCost = Math.max(...Object.values(summary.costByProvider));
                const pct = maxCost > 0 ? (cost / maxCost) * 100 : 0;

                return (
                  <div key={provider} className="flex items-center gap-3">
                    <span className="text-xs text-ui-textSecondary w-24 truncate shrink-0">{provider}</span>
                    <div className="flex-1 h-4 rounded bg-ui-background-depth-3 overflow-hidden">
                      <div
                        className="h-full rounded bg-purple-500/70 transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-ui-textPrimary w-16 text-right shrink-0">
                      {formatCost(cost)}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Usage by Model */}
      {Object.keys(summary.costByModel).length > 0 && (
        <div className="rounded-lg border border-ui-borderColor bg-ui-background-depth-2 p-4">
          <h3 className="text-sm font-medium text-ui-textPrimary mb-3 flex items-center gap-2">
            <span className="i-ph:cpu text-sm" />
            Cost by Model
          </h3>
          <div className="space-y-1.5">
            {Object.entries(summary.costByModel)
              .sort(([, a], [, b]) => b - a)
              .map(([model, cost]) => (
                <div key={model} className="flex items-center justify-between text-xs py-1">
                  <span className="text-ui-textSecondary truncate mr-3">{model}</span>
                  <span className="font-medium text-ui-textPrimary shrink-0">{formatCost(cost)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Daily Usage Chart */}
      {summary.dailyCosts.length > 0 && (
        <div className="rounded-lg border border-ui-borderColor bg-ui-background-depth-2 p-4">
          <h3 className="text-sm font-medium text-ui-textPrimary mb-3 flex items-center gap-2">
            <span className="i-ph:chart-bar text-sm" />
            Daily Usage
          </h3>
          <div className="flex items-end gap-0.5 h-24">
            {summary.dailyCosts.map(({ date, cost }) => {
              const maxDailyCost = Math.max(...summary.dailyCosts.map((d) => d.cost), 0.001);
              const heightPct = (cost / maxDailyCost) * 100;
              const dayNum = new Date(date).getDate();

              return (
                <div
                  key={date}
                  className="flex-1 flex flex-col items-center gap-0.5 group"
                  title={`${date}: ${formatCost(cost)}`}
                >
                  <div className="w-full flex items-end justify-center" style={{ height: '80px' }}>
                    <div
                      className="w-full max-w-[14px] rounded-t bg-purple-500/60 group-hover:bg-purple-500 transition-colors"
                      style={{ height: `${Math.max(1, heightPct)}%` }}
                    />
                  </div>
                  <span className="text-[9px] text-ui-textTertiary">{dayNum}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ui-textSecondary border border-ui-borderColor rounded hover:bg-ui-background-depth-3 transition-colors"
        >
          <span className="i-ph:download text-sm" />
          Export CSV
        </button>
        <button
          onClick={handleClearHistory}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 border border-red-500/30 rounded hover:bg-red-500/10 transition-colors"
        >
          <span className="i-ph:trash text-sm" />
          Clear History
        </button>
      </div>
    </div>
  );
});

/*
 * ==========================================
 * Helper Components
 * ==========================================
 */

function SummaryCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: string;
  accent: 'green' | 'blue' | 'purple' | 'cyan' | 'red' | 'amber';
}) {
  const bgColor: Record<string, string> = {
    green: 'bg-green-500/10 text-green-500',
    blue: 'bg-blue-500/10 text-blue-500',
    purple: 'bg-purple-500/10 text-purple-500',
    cyan: 'bg-cyan-500/10 text-cyan-500',
    red: 'bg-red-500/10 text-red-500',
    amber: 'bg-amber-500/10 text-amber-500',
  };

  return (
    <div className="rounded-lg border border-ui-borderColor bg-ui-background-depth-2 p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className={classNames('w-6 h-6 rounded flex items-center justify-center', bgColor[accent])}>
          <span className={classNames(icon, 'text-sm')} />
        </div>
        <span className="text-xs text-ui-textTertiary">{label}</span>
      </div>
      <div className="text-lg font-semibold text-ui-textPrimary">{value}</div>
    </div>
  );
}

/*
 * ==========================================
 * Format Helpers
 * ==========================================
 */

function formatCost(usd: number): string {
  if (usd === 0) {
    return '$0.00';
  }

  if (usd > 0 && usd < 0.01) {
    return '< $0.01';
  }

  return `$${usd.toFixed(2)}`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }

  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }

  return count.toString();
}
