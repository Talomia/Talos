/**
 * ThinkFlowPanel — Parallel Thinking Visualization
 * ==================================================
 * A panel that shows the progress and results of a ThinkFlow execution.
 * Displays individual thought progress, compiled results, and event log.
 */

import { useStore } from '@nanostores/react';
import { memo, useCallback } from 'react';
import { classNames } from '~/utils/classNames';
import {
  activeFlow,
  flowRunning,
  flowProgress,
  thoughts,
  completedThoughts,
  failedThoughts,
  compiledResult,
  thinkFlowPanelExpanded,
  cancelThinkFlow,
  clearThinkFlow,
} from '~/lib/modules/thinkflow';
import type { Thought, ThoughtStatus } from '~/lib/modules/thinkflow';

/*
 * ==========================================
 * Status Badge
 * ==========================================
 */

const statusConfig: Record<ThoughtStatus, { label: string; color: string; icon: string }> = {
  pending: { label: 'Pending', color: 'text-ui-textTertiary', icon: 'i-ph:clock' },
  running: { label: 'Running', color: 'text-blue-400', icon: 'i-ph:spinner-gap animate-spin' },
  streaming: { label: 'Streaming', color: 'text-blue-400', icon: 'i-ph:lightning animate-pulse' },
  completed: { label: 'Done', color: 'text-green-400', icon: 'i-ph:check-circle' },
  failed: { label: 'Failed', color: 'text-red-400', icon: 'i-ph:x-circle' },
  cancelled: { label: 'Cancelled', color: 'text-amber-400', icon: 'i-ph:prohibit' },
};

/*
 * ==========================================
 * Thought Card
 * ==========================================
 */

const ThoughtCard = memo(({ thought }: { thought: Thought }) => {
  const config = statusConfig[thought.status];

  return (
    <div
      className={classNames(
        'rounded-lg border p-3',
        'bg-ui-background-depth-2 border-ui-borderColor',
        thought.status === 'running' && 'border-blue-400/30',
        thought.status === 'completed' && 'border-green-400/20',
        thought.status === 'failed' && 'border-red-400/20',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1.5">
        <div className={classNames(config.icon, 'text-base', config.color)} />

        <span className="text-sm font-medium text-ui-textPrimary flex-1 truncate">{thought.label}</span>

        <span className={classNames('text-xs', config.color)}>{config.label}</span>
      </div>

      {/* Progress Bar */}
      {(thought.status === 'running' || thought.status === 'streaming') && (
        <div className="w-full h-1 rounded-full bg-ui-background-depth-1 mb-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-400 transition-all duration-300"
            style={{ width: `${thought.progress}%` }}
          />
        </div>
      )}

      {/* Response Preview */}
      {thought.responseText && (
        <div className="mt-2 text-xs text-ui-textSecondary line-clamp-3 leading-relaxed">
          {thought.responseText.slice(0, 200)}
          {thought.responseText.length > 200 && '...'}
        </div>
      )}

      {/* Error */}
      {thought.error && (
        <div className="mt-2 text-xs text-red-400 bg-red-400/10 rounded px-2 py-1">{thought.error}</div>
      )}

      {/* Timing */}
      {thought.timing.durationMs > 0 && (
        <div className="mt-1.5 text-xs text-ui-textTertiary">
          {(thought.timing.durationMs / 1000).toFixed(1)}s
          {thought.tokenUsage.totalTokens > 0 && ` · ${thought.tokenUsage.totalTokens.toLocaleString()} tokens`}
        </div>
      )}
    </div>
  );
});

ThoughtCard.displayName = 'ThoughtCard';

/*
 * ==========================================
 * Progress Header
 * ==========================================
 */

const FlowHeader = memo(() => {
  const flow = useStore(activeFlow);
  const running = useStore(flowRunning);
  const progress = useStore(flowProgress);
  const completed = useStore(completedThoughts);
  const failed = useStore(failedThoughts);
  const expanded = useStore(thinkFlowPanelExpanded);

  if (!flow) {
    return null;
  }

  return (
    <div className="px-3 py-2 bg-ui-background-depth-2 border-b border-ui-borderColor">
      <div className="flex items-center gap-2">
        <div
          className={classNames(
            'text-lg',
            running ? 'i-ph:brain animate-pulse text-purple-400' : 'i-ph:brain text-ui-textTertiary',
          )}
        />

        <span className="text-sm font-medium text-ui-textPrimary flex-1">
          {running ? "I'm thinking..." : flow.status === 'completed' ? 'Thoughts compiled' : `ThinkFlow ${flow.status}`}
        </span>

        <span className="text-xs text-ui-textTertiary">
          {completed}/{flow.thoughts.length}
          {failed > 0 && <span className="text-red-400 ml-1">({failed} failed)</span>}
        </span>

        {running && (
          <button
            onClick={() => cancelThinkFlow()}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
            title="Cancel ThinkFlow"
          >
            Cancel
          </button>
        )}

        <button
          onClick={() => thinkFlowPanelExpanded.set(!expanded)}
          className="text-ui-textTertiary hover:text-ui-textSecondary transition-colors"
        >
          <div className={classNames('i-ph:caret-down transition-transform duration-200', expanded && 'rotate-180')} />
        </button>
      </div>

      {/* Overall Progress Bar */}
      {running && (
        <div className="w-full h-1.5 rounded-full bg-ui-background-depth-1 mt-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-400 to-blue-400 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
});

FlowHeader.displayName = 'ThinkFlowHeader';

/*
 * ==========================================
 * Compiled Result
 * ==========================================
 */

const CompiledResult = memo(() => {
  const result = useStore(compiledResult);

  if (!result) {
    return null;
  }

  return (
    <div className="px-3 py-2 border-t border-ui-borderColor">
      <div className="flex items-center gap-2 mb-2">
        <div className="i-ph:file-text text-sm text-purple-400" />
        <span className="text-xs font-medium text-ui-textPrimary">Compiled Result</span>
      </div>

      <div className="text-xs text-ui-textSecondary leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
        {result}
      </div>
    </div>
  );
});

CompiledResult.displayName = 'ThinkFlowCompiledResult';

/*
 * ==========================================
 * Main Panel
 * ==========================================
 */

export const ThinkFlowPanel = memo(() => {
  const flow = useStore(activeFlow);
  const expanded = useStore(thinkFlowPanelExpanded);
  const thoughtList = useStore(thoughts);

  const handleClear = useCallback(() => {
    clearThinkFlow();
  }, []);

  if (!flow) {
    return null;
  }

  return (
    <div className="border-b border-ui-borderColor">
      <FlowHeader />

      {expanded && (
        <div className="bg-ui-background-depth-1">
          {/* Thought Cards */}
          <div className="flex flex-col gap-2 p-3">
            {thoughtList.map((thought) => (
              <ThoughtCard key={thought.id} thought={thought} />
            ))}
          </div>

          {/* Compiled Result */}
          <CompiledResult />

          {/* Footer */}
          {flow.status === 'completed' && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-ui-borderColor">
              <span className="text-xs text-ui-textTertiary">
                Completed in {((flow.timing.durationMs ?? 0) / 1000).toFixed(1)}s
              </span>

              <button
                onClick={handleClear}
                className="text-xs text-ui-textTertiary hover:text-ui-textSecondary transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

ThinkFlowPanel.displayName = 'ThinkFlowPanel';
