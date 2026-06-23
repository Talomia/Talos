/**
 * ThinkFlow Module — Public API
 * ===============================
 * Re-exports the public API of the ThinkFlow parallel thinking system.
 */

// Runner and types
export { ThinkFlowRunner, thinkFlowEventLog, createAnalysisFlow, createCodeReviewFlow } from './runner';

export type {
  ThoughtId,
  ThoughtStatus,
  Thought,
  ThinkFlowConfig,
  FlowStatus,
  ThinkFlow,
  ThinkFlowEvent,
  ThinkFlowEventListener,
  ThinkFlowLogEntry,
} from './runner';

// Store (reactive state)
export {
  activeFlow,
  activeRunner,
  flowRunning,
  flowProgress,
  thoughts,
  completedThoughts,
  failedThoughts,
  compiledResult,
  thinkFlowPanelExpanded,
  flowEventLog,
  flowHistory,
  startThinkFlow,
  cancelThinkFlow,
  clearThinkFlow,
  getThoughtById,
  clearFlowHistory,
} from './store';
