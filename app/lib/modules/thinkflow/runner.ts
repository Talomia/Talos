/**
 * ThinkFlow — Parallel Thinking Orchestration
 * =============================================
 * Orchestrates multiple LLM calls in parallel for multi-path AI reasoning.
 * Each "Thought" is an independent LLM execution with its own context,
 * and the ThinkFlow runner coordinates them, tracks progress, and
 * compiles results.
 *
 * Key concepts:
 * - Thought: A single LLM reasoning path with a specific focus
 * - ThinkFlow: A collection of parallel Thoughts
 * - Compilation: Aggregating results from multiple Thoughts into a final response
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('think-flow');

/*
 * ==========================================
 * Types
 * ==========================================
 */

/** Unique identifier for a thought. */
export type ThoughtId = string;

/** Status of a single thought execution. */
export type ThoughtStatus = 'pending' | 'running' | 'streaming' | 'completed' | 'failed' | 'cancelled';

/** A single reasoning path in a ThinkFlow. */
export interface Thought {
  /** Unique ID for this thought. */
  id: ThoughtId;

  /** Human-readable label for the thought (e.g., "Architecture Analysis"). */
  label: string;

  /** The focus/question this thought addresses. */
  focus: string;

  /** System prompt override for this thought (optional). */
  systemPrompt?: string;

  /** Current execution status. */
  status: ThoughtStatus;

  /** Accumulated response text. */
  responseText: string;

  /** Token usage for this thought. */
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  /** Execution timing. */
  timing: {
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number;
  };

  /** Error message if the thought failed. */
  error?: string;

  /** Progress percentage (0-100). */
  progress: number;

  /** Model used for this thought. */
  model?: string;

  /** Provider used for this thought. */
  provider?: string;
}

/** Configuration for a ThinkFlow execution. */
export interface ThinkFlowConfig {
  /** The model to use for all thoughts (can be overridden per-thought). */
  model: string;

  /** The provider to use. */
  provider: string;

  /** Maximum parallel thoughts. Default: 3. */
  maxParallel: number;

  /** Timeout per thought in ms. Default: 120000 (2 minutes). */
  thoughtTimeout: number;

  /** Whether to abort all thoughts if one fails. Default: false. */
  abortOnFailure: boolean;

  /** Whether to auto-compile results. Default: true. */
  autoCompile: boolean;
}

/** Status of the entire ThinkFlow. */
export type FlowStatus = 'idle' | 'running' | 'compiling' | 'completed' | 'failed' | 'cancelled';

/** A ThinkFlow execution plan. */
export interface ThinkFlow {
  /** Unique ID for this flow. */
  id: string;

  /** All thoughts in this flow. */
  thoughts: Thought[];

  /** Overall flow status. */
  status: FlowStatus;

  /** Configuration. */
  config: ThinkFlowConfig;

  /** Compiled result (aggregated from all thoughts). */
  compiledResult?: string;

  /** Overall timing. */
  timing: {
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number;
  };

  /** Overall progress (0-100). */
  progress: number;
}

/** Event types emitted by the ThinkFlow runner. */
export type ThinkFlowEvent =
  | { type: 'flow-started'; flowId: string }
  | { type: 'thought-started'; flowId: string; thoughtId: ThoughtId }
  | { type: 'thought-progress'; flowId: string; thoughtId: ThoughtId; text: string; progress: number }
  | { type: 'thought-completed'; flowId: string; thoughtId: ThoughtId; result: string }
  | { type: 'thought-failed'; flowId: string; thoughtId: ThoughtId; error: string }
  | { type: 'flow-compiling'; flowId: string }
  | { type: 'flow-completed'; flowId: string; result: string }
  | { type: 'flow-failed'; flowId: string; error: string };

/** Event listener callback. */
export type ThinkFlowEventListener = (event: ThinkFlowEvent) => void;

/*
 * ==========================================
 * Constants
 * ==========================================
 */

const DEFAULT_CONFIG: ThinkFlowConfig = {
  model: '',
  provider: '',
  maxParallel: 3,
  thoughtTimeout: 120_000,
  abortOnFailure: false,
  autoCompile: true,
};

/*
 * ==========================================
 * ThinkFlow Runner
 * ==========================================
 */

/**
 * The ThinkFlow runner orchestrates parallel thought executions.
 */
export class ThinkFlowRunner {
  private _flow: ThinkFlow;
  private _abortControllers = new Map<ThoughtId, AbortController>();
  private _listeners = new Set<ThinkFlowEventListener>();

  constructor(
    thoughts: Array<{ label: string; focus: string; systemPrompt?: string }>,
    config: Partial<ThinkFlowConfig>,
  ) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    this._flow = {
      id: generateFlowId(),
      thoughts: thoughts.map((t) => ({
        id: generateThoughtId(),
        label: t.label,
        focus: t.focus,
        systemPrompt: t.systemPrompt,
        status: 'pending',
        responseText: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        timing: { startedAt: null, completedAt: null, durationMs: 0 },
        progress: 0,
      })),
      status: 'idle',
      config: mergedConfig,
      timing: { startedAt: null, completedAt: null, durationMs: 0 },
      progress: 0,
    };
  }

  /** Get the current flow state (immutable snapshot). */
  getFlow(): Readonly<ThinkFlow> {
    return { ...this._flow };
  }

  /** Subscribe to flow events. Returns unsubscribe function. */
  on(listener: ThinkFlowEventListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _emit(event: ThinkFlowEvent) {
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (error) {
        logger.error('Event listener error:', error);
      }
    }
  }

  /**
   * Execute all thoughts in parallel (bounded by maxParallel).
   */
  async execute(): Promise<ThinkFlow> {
    if (this._flow.status !== 'idle') {
      throw new Error(`Cannot execute flow in '${this._flow.status}' state`);
    }

    this._flow.status = 'running';
    this._flow.timing.startedAt = new Date().toISOString();
    this._emit({ type: 'flow-started', flowId: this._flow.id });

    logger.info(`ThinkFlow ${this._flow.id} started with ${this._flow.thoughts.length} thoughts`);

    try {
      // Execute thoughts in batches of maxParallel
      const batches = this._createBatches();

      for (const batch of batches) {
        const results = await Promise.allSettled(batch.map((thought) => this._executeThought(thought)));

        // Check for failures if abortOnFailure is set
        if (this._flow.config.abortOnFailure) {
          const failures = results.filter((r) => r.status === 'rejected');

          if (failures.length > 0) {
            this._cancelRemainingThoughts();
            this._flow.status = 'failed';
            this._emit({
              type: 'flow-failed',
              flowId: this._flow.id,
              error: 'One or more thoughts failed',
            });

            return this._flow;
          }
        }
      }

      // Compile results
      if (this._flow.config.autoCompile) {
        this._flow.status = 'compiling';
        this._emit({ type: 'flow-compiling', flowId: this._flow.id });
        this._flow.compiledResult = this._compileResults();
      }

      this._flow.status = 'completed';
      this._flow.timing.completedAt = new Date().toISOString();
      this._flow.timing.durationMs =
        new Date(this._flow.timing.completedAt).getTime() - new Date(this._flow.timing.startedAt!).getTime();
      this._flow.progress = 100;

      this._emit({
        type: 'flow-completed',
        flowId: this._flow.id,
        result: this._flow.compiledResult ?? '',
      });

      logger.info(
        `ThinkFlow ${this._flow.id} completed in ${this._flow.timing.durationMs}ms ` +
          `(${this._flow.thoughts.filter((t) => t.status === 'completed').length}/${this._flow.thoughts.length} succeeded)`,
      );
    } catch (error) {
      this._flow.status = 'failed';
      this._flow.timing.completedAt = new Date().toISOString();

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this._emit({ type: 'flow-failed', flowId: this._flow.id, error: errorMessage });
      logger.error(`ThinkFlow ${this._flow.id} failed:`, error);
    }

    return this._flow;
  }

  /** Cancel all running thoughts. */
  cancel() {
    this._cancelRemainingThoughts();
    this._flow.status = 'cancelled';
    this._flow.timing.completedAt = new Date().toISOString();
    logger.info(`ThinkFlow ${this._flow.id} cancelled`);
  }

  /**
   * Execute a single thought by calling the chat API.
   */
  private async _executeThought(thought: Thought): Promise<void> {
    const abortController = new AbortController();
    this._abortControllers.set(thought.id, abortController);

    // Set timeout
    const timeoutId = setTimeout(() => {
      abortController.abort();
      thought.status = 'failed';
      thought.error = `Thought timed out after ${this._flow.config.thoughtTimeout}ms`;
    }, this._flow.config.thoughtTimeout);

    thought.status = 'running';
    thought.timing.startedAt = new Date().toISOString();
    this._emit({ type: 'thought-started', flowId: this._flow.id, thoughtId: thought.id });

    try {
      const response = await fetch('/api/llmcall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: thought.model || this._flow.config.model,
          provider: thought.provider || this._flow.config.provider,
          messages: [
            ...(thought.systemPrompt ? [{ role: 'system', content: thought.systemPrompt }] : []),
            { role: 'user', content: thought.focus },
          ],
          maxTokens: 4096,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API error ${response.status}: ${errorBody}`);
      }

      const data = (await response.json()) as {
        text?: string;
        usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
      };

      thought.responseText = data.text ?? '';

      if (data.usage) {
        thought.tokenUsage = data.usage;
      }

      thought.status = 'completed';
      thought.progress = 100;
      thought.timing.completedAt = new Date().toISOString();
      thought.timing.durationMs =
        new Date(thought.timing.completedAt).getTime() - new Date(thought.timing.startedAt!).getTime();

      this._emit({
        type: 'thought-completed',
        flowId: this._flow.id,
        thoughtId: thought.id,
        result: thought.responseText,
      });

      this._updateFlowProgress();

      logger.debug(`Thought '${thought.label}' completed in ${thought.timing.durationMs}ms`);
    } catch (error) {
      if (abortController.signal.aborted && !thought.error) {
        thought.error = 'Thought was cancelled';
        thought.status = 'cancelled';
      } else {
        thought.error = error instanceof Error ? error.message : 'Unknown error';
        thought.status = 'failed';
      }

      thought.timing.completedAt = new Date().toISOString();
      thought.timing.durationMs =
        new Date(thought.timing.completedAt).getTime() - new Date(thought.timing.startedAt!).getTime();

      this._emit({
        type: 'thought-failed',
        flowId: this._flow.id,
        thoughtId: thought.id,
        error: thought.error,
      });

      logger.warn(`Thought '${thought.label}' failed: ${thought.error}`);
    } finally {
      clearTimeout(timeoutId);
      this._abortControllers.delete(thought.id);
    }
  }

  private _createBatches(): Thought[][] {
    const batches: Thought[][] = [];
    const { maxParallel } = this._flow.config;

    for (let i = 0; i < this._flow.thoughts.length; i += maxParallel) {
      batches.push(this._flow.thoughts.slice(i, i + maxParallel));
    }

    return batches;
  }

  private _cancelRemainingThoughts() {
    for (const [, controller] of this._abortControllers) {
      controller.abort();
    }

    for (const thought of this._flow.thoughts) {
      if (thought.status === 'pending' || thought.status === 'running') {
        thought.status = 'cancelled';
      }
    }
  }

  private _updateFlowProgress() {
    const total = this._flow.thoughts.length;
    const completed = this._flow.thoughts.filter(
      (t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled',
    ).length;

    this._flow.progress = Math.round((completed / total) * 100);
  }

  /**
   * Compile results from all completed thoughts into a unified response.
   */
  private _compileResults(): string {
    const completed = this._flow.thoughts.filter((t) => t.status === 'completed');
    const failed = this._flow.thoughts.filter((t) => t.status === 'failed');

    if (completed.length === 0) {
      return 'No thoughts completed successfully.';
    }

    const parts: string[] = [];

    for (const thought of completed) {
      parts.push(`## ${thought.label}`);
      parts.push('');
      parts.push(thought.responseText);
      parts.push('');
    }

    if (failed.length > 0) {
      parts.push('---');
      parts.push(`*${failed.length} thought(s) failed and were excluded from this compilation.*`);
    }

    return parts.join('\n');
  }
}

/*
 * ==========================================
 * ThinkFlow Event Log
 * ==========================================
 */

export interface ThinkFlowLogEntry {
  /** ISO timestamp. */
  timestamp: string;

  /** Flow ID. */
  flowId: string;

  /** Event type. */
  eventType: ThinkFlowEvent['type'];

  /** Thought ID (if applicable). */
  thoughtId?: string;

  /** Additional data. */
  data?: Record<string, unknown>;
}

/**
 * In-memory event log for the current session.
 * Can be persisted to IndexedDB if needed.
 */
class ThinkFlowEventLog {
  private _entries: ThinkFlowLogEntry[] = [];
  private _maxEntries = 1000;

  /** Record an event. */
  record(event: ThinkFlowEvent) {
    const entry: ThinkFlowLogEntry = {
      timestamp: new Date().toISOString(),
      flowId: event.flowId,
      eventType: event.type,
    };

    if ('thoughtId' in event) {
      entry.thoughtId = event.thoughtId;
    }

    if ('error' in event) {
      entry.data = { error: event.error };
    }

    if ('result' in event) {
      entry.data = { resultLength: event.result.length };
    }

    if ('progress' in event) {
      entry.data = { progress: event.progress };
    }

    this._entries.push(entry);

    // Trim old entries
    if (this._entries.length > this._maxEntries) {
      this._entries = this._entries.slice(-this._maxEntries);
    }
  }

  /** Get all entries. */
  getEntries(): readonly ThinkFlowLogEntry[] {
    return this._entries;
  }

  /** Get entries for a specific flow. */
  getEntriesByFlow(flowId: string): ThinkFlowLogEntry[] {
    return this._entries.filter((e) => e.flowId === flowId);
  }

  /** Clear all entries. */
  clear() {
    this._entries = [];
  }
}

/** Singleton event log instance. */
export const thinkFlowEventLog = new ThinkFlowEventLog();

/*
 * ==========================================
 * Utility Functions
 * ==========================================
 */

/** Generate a unique flow ID. */
function generateFlowId(): string {
  return `flow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Generate a unique thought ID. */
function generateThoughtId(): string {
  return `thought-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a ThinkFlow for common analysis patterns.
 * Pre-configured thought templates for common use cases.
 */
export function createAnalysisFlow(question: string, config: Partial<ThinkFlowConfig>): ThinkFlowRunner {
  return new ThinkFlowRunner(
    [
      {
        label: 'Architecture Analysis',
        focus: `Analyze the architectural implications of: ${question}\n\nFocus on system design, component relationships, and scalability.`,
      },
      {
        label: 'Implementation Strategy',
        focus: `Propose a concrete implementation plan for: ${question}\n\nFocus on specific files, functions, and code changes needed.`,
      },
      {
        label: 'Risk Assessment',
        focus: `Identify potential risks and edge cases for: ${question}\n\nFocus on error scenarios, performance implications, and security concerns.`,
      },
    ],
    config,
  );
}

/**
 * Create a ThinkFlow for code review.
 */
export function createCodeReviewFlow(code: string, config: Partial<ThinkFlowConfig>): ThinkFlowRunner {
  return new ThinkFlowRunner(
    [
      {
        label: 'Correctness Review',
        focus: `Review this code for correctness:\n\n${code}\n\nCheck for bugs, logic errors, and edge cases.`,
      },
      {
        label: 'Performance Review',
        focus: `Review this code for performance:\n\n${code}\n\nCheck for inefficiencies, memory leaks, and optimization opportunities.`,
      },
      {
        label: 'Security Review',
        focus: `Review this code for security:\n\n${code}\n\nCheck for vulnerabilities, injection risks, and data exposure.`,
      },
    ],
    config,
  );
}
