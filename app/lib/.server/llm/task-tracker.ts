/**
 * Task Tracker — Progress Tracking Across Continuations
 * ======================================================
 * Maintains a structured task checklist across multi-segment
 * LLM responses. Tracks completed vs remaining work and feeds
 * the status back to the AI on each continuation to prevent
 * repeated work and ensure completeness.
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('task-tracker');

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'skipped';

export interface TrackedTask {
  id: string;
  description: string;
  type: 'file-create' | 'file-modify' | 'shell-command' | 'dependency-install' | 'config-update' | 'verification';
  filePath?: string;
  status: TaskStatus;
  priority: 'critical' | 'high' | 'medium' | 'low';
  startedAt?: number;
  completedAt?: number;
  error?: string;

  /** Segment number where this task was completed */
  segment?: number;
}

export interface TaskTrackerState {
  /** All tracked tasks */
  tasks: TrackedTask[];

  /** Current continuation segment number */
  currentSegment: number;

  /** Total tokens used across all segments */
  totalTokensUsed: number;

  /** Files successfully created */
  completedFiles: string[];

  /** Files that failed */
  failedFiles: string[];

  /** Commands successfully executed */
  completedCommands: string[];
}

export class TaskTracker {
  #state: TaskTrackerState;

  constructor() {
    this.#state = {
      tasks: [],
      currentSegment: 0,
      totalTokensUsed: 0,
      completedFiles: [],
      failedFiles: [],
      completedCommands: [],
    };
  }

  /**
   * Initialize the tracker from a plan's steps.
   */
  initFromPlan(
    steps: Array<{
      id: string;
      description: string;
      type: TrackedTask['type'];
      filePath?: string;
      priority: TrackedTask['priority'];
    }>,
  ) {
    this.#state.tasks = steps.map((step) => ({
      ...step,
      status: 'pending' as TaskStatus,
    }));

    logger.info(`Task tracker initialized with ${this.#state.tasks.length} tasks`);
  }

  /**
   * Mark a task as in-progress.
   */
  startTask(taskId: string) {
    const task = this.#state.tasks.find((t) => t.id === taskId);

    if (task) {
      task.status = 'in-progress';
      task.startedAt = Date.now();
      logger.debug(`Task ${taskId} started: ${task.description}`);
    }
  }

  /**
   * Mark a task as completed.
   */
  completeTask(taskId: string) {
    const task = this.#state.tasks.find((t) => t.id === taskId);

    if (task) {
      task.status = 'completed';
      task.completedAt = Date.now();
      task.segment = this.#state.currentSegment;

      if (task.filePath) {
        this.#state.completedFiles.push(task.filePath);
      }

      logger.debug(`Task ${taskId} completed: ${task.description}`);
    }
  }

  /**
   * Mark a task as failed.
   */
  failTask(taskId: string, error: string) {
    const task = this.#state.tasks.find((t) => t.id === taskId);

    if (task) {
      task.status = 'failed';
      task.error = error;

      if (task.filePath) {
        this.#state.failedFiles.push(task.filePath);
      }

      logger.warn(`Task ${taskId} failed: ${task.description} — ${error}`);
    }
  }

  /**
   * Auto-detect completed tasks by comparing against actual file operations.
   * Called after each LLM response to sync state with reality.
   */
  syncWithActions(createdFiles: string[], executedCommands: string[]) {
    for (const task of this.#state.tasks) {
      if (task.status === 'completed') {
        continue;
      }

      // Match file creation/modification tasks
      if (task.filePath) {
        const normalizedPath = task.filePath.replace(/^\/home\/project\//, '');
        const wasCreated = createdFiles.some(
          (f) => f.replace(/^\/home\/project\//, '') === normalizedPath || f.endsWith(normalizedPath),
        );

        if (wasCreated) {
          task.status = 'completed';
          task.completedAt = Date.now();
          task.segment = this.#state.currentSegment;
          this.#state.completedFiles.push(task.filePath);
          logger.debug(`Task ${task.id} auto-completed via file match: ${task.filePath}`);
        }
      }

      // Match shell command tasks
      if (task.type === 'shell-command' || task.type === 'dependency-install') {
        const wasExecuted = executedCommands.some(
          (cmd) =>
            task.description.toLowerCase().includes(cmd.toLowerCase()) ||
            cmd.toLowerCase().includes(task.description.toLowerCase()),
        );

        if (wasExecuted) {
          task.status = 'completed';
          task.completedAt = Date.now();
          task.segment = this.#state.currentSegment;
          this.#state.completedCommands.push(task.description);
          logger.debug(`Task ${task.id} auto-completed via command match`);
        }
      }
    }
  }

  /**
   * Advance to the next continuation segment.
   */
  nextSegment() {
    this.#state.currentSegment++;
    logger.info(`Advanced to segment ${this.#state.currentSegment}`);
  }

  /**
   * Add tokens used in the current segment.
   */
  addTokensUsed(tokens: number) {
    this.#state.totalTokensUsed += tokens;
  }

  /**
   * Get completion stats.
   */
  getStats() {
    const total = this.#state.tasks.length;
    const completed = this.#state.tasks.filter((t) => t.status === 'completed').length;
    const failed = this.#state.tasks.filter((t) => t.status === 'failed').length;
    const pending = this.#state.tasks.filter((t) => t.status === 'pending').length;
    const inProgress = this.#state.tasks.filter((t) => t.status === 'in-progress').length;

    return {
      total,
      completed,
      failed,
      pending,
      inProgress,
      percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0,
      currentSegment: this.#state.currentSegment,
      totalTokensUsed: this.#state.totalTokensUsed,
    };
  }

  /**
   * Generate a continuation prompt that tells the AI what's done and what remains.
   * This is injected into the CONTINUE_PROMPT to maintain coherence across segments.
   */
  generateContinuationContext(): string {
    const stats = this.getStats();
    const remaining = this.#state.tasks.filter((t) => t.status === 'pending' || t.status === 'in-progress');
    const completed = this.#state.tasks.filter((t) => t.status === 'completed');
    const failed = this.#state.tasks.filter((t) => t.status === 'failed');

    let context = `\n<task_progress>\n`;
    context += `PROGRESS: ${stats.completed}/${stats.total} tasks completed (${stats.percentComplete}%), segment ${stats.currentSegment + 1}\n\n`;

    if (completed.length > 0) {
      context += `COMPLETED TASKS (DO NOT REPEAT):\n`;
      completed.forEach((t) => {
        context += `✅ ${t.description}${t.filePath ? ` (${t.filePath})` : ''}\n`;
      });
      context += `\n`;
    }

    if (failed.length > 0) {
      context += `FAILED TASKS (RETRY OR ADAPT):\n`;
      failed.forEach((t) => {
        context += `❌ ${t.description}: ${t.error || 'Unknown error'}\n`;
      });
      context += `\n`;
    }

    if (remaining.length > 0) {
      context += `REMAINING TASKS (DO THESE NEXT):\n`;
      remaining.forEach((t, i) => {
        context += `${i + 1}. [${t.priority.toUpperCase()}] ${t.description}${t.filePath ? ` (${t.filePath})` : ''}\n`;
      });
    } else {
      context += `ALL TASKS COMPLETED. Focus on verification and polish.\n`;
    }

    context += `</task_progress>\n`;

    return context;
  }

  /**
   * Check if all critical tasks are done.
   */
  allCriticalTasksComplete(): boolean {
    return this.#state.tasks
      .filter((t) => t.priority === 'critical')
      .every((t) => t.status === 'completed' || t.status === 'skipped');
  }

  /**
   * Check if all tasks are done.
   */
  allTasksComplete(): boolean {
    return this.#state.tasks.every((t) => t.status === 'completed' || t.status === 'skipped');
  }

  /**
   * Get the full state for serialization.
   */
  getState(): TaskTrackerState {
    return { ...this.#state };
  }

  /**
   * Restore state from a serialized snapshot.
   */
  restoreState(state: TaskTrackerState) {
    this.#state = { ...state };
    logger.info(`Task tracker state restored: ${this.getStats().completed}/${this.getStats().total} tasks completed`);
  }
}
