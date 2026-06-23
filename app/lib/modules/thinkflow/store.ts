/**
 * ThinkFlow Store — Client-side State Management
 * =================================================
 * Nanostore atoms for ThinkFlow UI components.
 * Provides reactive state for thought progress, flow status,
 * and event log visualization.
 */

import { atom, computed } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
import type { ThinkFlow, Thought, ThinkFlowLogEntry } from './runner';
import { ThinkFlowRunner, thinkFlowEventLog } from './runner';
import type { ThinkFlowConfig } from './runner';

const logger = createScopedLogger('thinkflow-store');

/*
 * ==========================================
 * Reactive State
 * ==========================================
 */

/** The currently active ThinkFlow (if any). */
export const activeFlow = atom<ThinkFlow | null>(null);

/** The ThinkFlow runner instance (for cancellation). */
export const activeRunner = atom<ThinkFlowRunner | null>(null);

/** Whether a flow is currently executing. */
export const flowRunning = computed(activeFlow, (flow) => {
  return flow?.status === 'running' || flow?.status === 'compiling';
});

/** Overall progress percentage. */
export const flowProgress = computed(activeFlow, (flow) => flow?.progress ?? 0);

/** List of all thoughts in the active flow. */
export const thoughts = computed(activeFlow, (flow) => flow?.thoughts ?? []);

/** Number of completed thoughts. */
export const completedThoughts = computed(
  thoughts,
  (t) => t.filter((thought) => thought.status === 'completed').length,
);

/** Number of failed thoughts. */
export const failedThoughts = computed(thoughts, (t) => t.filter((thought) => thought.status === 'failed').length);

/** The compiled result from the flow. */
export const compiledResult = computed(activeFlow, (flow) => flow?.compiledResult ?? null);

/** Whether the ThinkFlow panel is expanded. */
export const thinkFlowPanelExpanded = atom<boolean>(true);

/** Event log entries for the active flow. */
export const flowEventLog = atom<ThinkFlowLogEntry[]>([]);

/** History of past flows. */
export const flowHistory = atom<ThinkFlow[]>([]);

/*
 * ==========================================
 * Actions
 * ==========================================
 */

/**
 * Start a new ThinkFlow with the given thoughts.
 */
export async function startThinkFlow(
  thoughtDefinitions: Array<{ label: string; focus: string; systemPrompt?: string }>,
  config: Partial<ThinkFlowConfig>,
): Promise<ThinkFlow | null> {
  // Cancel any running flow
  const currentRunner = activeRunner.get();

  if (currentRunner) {
    currentRunner.cancel();
  }

  const runner = new ThinkFlowRunner(thoughtDefinitions, config);

  // Subscribe to events
  runner.on((event) => {
    // Update active flow state
    activeFlow.set(runner.getFlow());

    // Record in event log
    thinkFlowEventLog.record(event);
    flowEventLog.set([...thinkFlowEventLog.getEntriesByFlow(runner.getFlow().id)]);

    // Log significant events
    if (event.type === 'thought-completed') {
      logger.info(`Thought completed: ${event.thoughtId}`);
    } else if (event.type === 'flow-completed') {
      logger.info(`ThinkFlow completed with ${runner.getFlow().thoughts.length} thoughts`);
    }
  });

  // Set initial state
  activeRunner.set(runner);
  activeFlow.set(runner.getFlow());
  thinkFlowPanelExpanded.set(true);

  try {
    const result = await runner.execute();

    // Add to history
    flowHistory.set([result, ...flowHistory.get().slice(0, 9)]);

    // Final state update
    activeFlow.set(runner.getFlow());

    return result;
  } catch (error) {
    logger.error('ThinkFlow execution error:', error);

    return null;
  }
}

/**
 * Cancel the currently running flow.
 */
export function cancelThinkFlow(): void {
  const runner = activeRunner.get();

  if (runner) {
    runner.cancel();
    activeFlow.set(runner.getFlow());
    logger.info('ThinkFlow cancelled');
  }
}

/**
 * Clear the active flow state.
 */
export function clearThinkFlow(): void {
  cancelThinkFlow();
  activeFlow.set(null);
  activeRunner.set(null);
  flowEventLog.set([]);
}

/**
 * Get a specific thought by ID from the active flow.
 */
export function getThoughtById(thoughtId: string): Thought | null {
  const flow = activeFlow.get();

  if (!flow) {
    return null;
  }

  return flow.thoughts.find((t) => t.id === thoughtId) ?? null;
}

/**
 * Clear flow history.
 */
export function clearFlowHistory(): void {
  flowHistory.set([]);
  thinkFlowEventLog.clear();
}
