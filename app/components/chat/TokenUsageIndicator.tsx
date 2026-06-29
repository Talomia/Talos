import React, { memo, useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { usageSummary, budgetConfig } from '~/lib/stores/tokenCost';
import { classNames } from '~/utils/classNames';
import { formatCost, formatCostFull, formatTokenCount } from '~/utils/formatters';

/**
 * Compact token-usage indicator for the chat header.
 *
 * Shows a small pill with the monthly cost; on hover/click it
 * expands a dropdown with detailed usage breakdown.
 */
export const TokenUsageIndicator = memo(() => {
  const summary = useStore(usageSummary);
  const budget = useStore(budgetConfig);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // Don't render when there's no usage data
  if (summary.monthlyTotalUsd === 0 && summary.dailyTotalUsd === 0) {
    return null;
  }

  const statusColors: Record<typeof summary.budgetStatus, string> = {
    ok: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/50',
    warning:
      'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
    exceeded: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/50',
    unlimited: 'bg-ui-background-depth-2 text-ui-textSecondary border-ui-borderColor',
  };

  const topModels = Object.entries(summary.costByModel)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  const totalTokens = summary.monthlyInputTokens + summary.monthlyOutputTokens;

  return (
    <div ref={containerRef} className="relative">
      {/* Pill trigger */}
      <button
        onClick={toggle}
        className={classNames(
          'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer',
          statusColors[summary.budgetStatus],
        )}
        aria-label="Token usage"
      >
        <span className="i-ph:coins text-xs" />
        <span>{formatCost(summary.monthlyTotalUsd)}</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-64 z-50 rounded-lg border border-ui-borderColor bg-ui-background-depth-1 shadow-lg overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2 border-b border-ui-borderColor">
            <div className="text-xs font-semibold text-ui-textSecondary">Token Usage</div>
          </div>

          <div className="px-3 py-2 space-y-2.5">
            {/* Cost summary */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-ui-textTertiary">Today</div>
                <div className="font-medium text-ui-textSecondary">{formatCostFull(summary.dailyTotalUsd)}</div>
              </div>
              <div>
                <div className="text-ui-textTertiary">This Month</div>
                <div className="font-medium text-ui-textSecondary">{formatCostFull(summary.monthlyTotalUsd)}</div>
              </div>
            </div>

            {/* Token counts */}
            <div className="text-xs">
              <div className="text-ui-textTertiary">Tokens this month</div>
              <div className="font-medium text-ui-textSecondary">
                {formatTokenCount(totalTokens)}
                <span className="text-ui-textTertiary font-normal ml-1">
                  ({formatTokenCount(summary.monthlyInputTokens)} in / {formatTokenCount(summary.monthlyOutputTokens)}{' '}
                  out)
                </span>
              </div>
            </div>

            {/* Top models */}
            {topModels.length > 0 && (
              <div className="text-xs">
                <div className="text-ui-textTertiary mb-1">Top models by cost</div>
                <div className="space-y-0.5">
                  {topModels.map(([model, cost]) => (
                    <div key={model} className="flex items-center justify-between">
                      <span className="text-ui-textSecondary truncate mr-2">{model}</span>
                      <span className="text-ui-textPrimary font-medium shrink-0">{formatCostFull(cost)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Budget bar */}
            {budget.monthlyLimitUsd > 0 && (
              <div className="text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-ui-textTertiary">Budget</span>
                  <span className="text-ui-textSecondary">
                    {formatCostFull(summary.monthlyTotalUsd)} / ${budget.monthlyLimitUsd.toFixed(2)}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-ui-background-depth-3 overflow-hidden">
                  <div
                    className={classNames('h-full rounded-full transition-all', {
                      'bg-green-500': summary.budgetStatus === 'ok',
                      'bg-amber-500': summary.budgetStatus === 'warning',
                      'bg-red-500': summary.budgetStatus === 'exceeded',
                    })}
                    style={{ width: `${Math.min(100, summary.budgetUsedPercent)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
