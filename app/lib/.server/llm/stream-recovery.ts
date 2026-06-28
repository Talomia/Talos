import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('stream-recovery');

export interface StreamRecoveryOptions {
  /** Maximum number of retry attempts before giving up. Default: 3 */
  maxRetries?: number;

  /** Timeout in ms before a stream is considered stalled. Default: 30000 */
  timeout?: number;

  /**
   * Called when a stream stall is detected before a retry attempt.
   * Return a Promise that resolves when the retry stream is ready,
   * or return void/undefined to skip the actual retry (monitoring only).
   */
  onRetry?: (attempt: number) => Promise<void> | void;

  /**
   * Called when a stream recovers after a stall (activity resumes
   * either from a retry or from the original stream resuming).
   */
  onRecovery?: (attempt: number) => void;

  /**
   * Called when all retry attempts are exhausted and the stream
   * is still stalled. The caller should abort and notify the client.
   */
  onMaxRetriesReached?: (totalAttempts: number) => void;

  /**
   * Called on every stall detection, including after max retries.
   * Useful for writing annotations to the data stream.
   */
  onStallDetected?: (attempt: number, isRecoverable: boolean) => void;
}

/**
 * Monitors a server-side LLM stream for stalls and coordinates recovery.
 *
 * Usage:
 * ```ts
 * const recovery = new StreamRecoveryManager({
 *   timeout: 45000,
 *   maxRetries: 2,
 *   onRetry: async (attempt) => {
 *     // Abort current stream and re-initiate
 *     controller.abort();
 *     await startNewStream();
 *   },
 *   onMaxRetriesReached: () => {
 *     // Write error annotation to data stream
 *     dataStream.writeMessageAnnotation({ type: 'stream-error', recoverable: false });
 *   },
 * });
 *
 * recovery.startMonitoring();
 * // On each chunk received:
 * recovery.updateActivity();
 * // When stream completes:
 * recovery.stop();
 * ```
 */
export class StreamRecoveryManager {
  private _retryCount = 0;
  private _timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private _lastActivity: number = Date.now();
  private _isActive = true;
  private _isRecovering = false;
  private readonly _maxRetries: number;
  private readonly _timeout: number;

  constructor(private _options: StreamRecoveryOptions = {}) {
    this._maxRetries = _options.maxRetries ?? 3;
    this._timeout = _options.timeout ?? 30000;
  }

  /** Begin monitoring the stream for stalls. */
  startMonitoring() {
    this._isActive = true;
    this._resetTimeout();
    logger.info(`Stream monitoring started (timeout: ${this._timeout}ms, maxRetries: ${this._maxRetries})`);
  }

  /**
   * Signal that stream activity was received (a chunk arrived).
   * Resets the stall timer. If we were in recovery mode, signals success.
   */
  updateActivity() {
    this._lastActivity = Date.now();

    if (this._isRecovering) {
      this._isRecovering = false;
      logger.info(`Stream recovered after ${this._retryCount} attempt(s)`);

      if (this._options.onRecovery) {
        this._options.onRecovery(this._retryCount);
      }

      this._retryCount = 0; // Reset for any future stalls
    }

    this._resetTimeout();
  }

  /** Stop monitoring. Call when the stream completes normally. */
  stop() {
    this._isActive = false;

    if (this._timeoutHandle) {
      clearTimeout(this._timeoutHandle);
      this._timeoutHandle = null;
    }

    logger.debug(`Stream monitoring stopped (${this._retryCount} recovery attempt(s) made)`);
  }

  /** Get current monitoring status. */
  getStatus() {
    return {
      isActive: this._isActive,
      isRecovering: this._isRecovering,
      retryCount: this._retryCount,
      maxRetries: this._maxRetries,
      lastActivity: this._lastActivity,
      timeSinceLastActivity: Date.now() - this._lastActivity,
    };
  }

  private _resetTimeout() {
    if (this._timeoutHandle) {
      clearTimeout(this._timeoutHandle);
    }

    if (!this._isActive) {
      return;
    }

    this._timeoutHandle = setTimeout(() => {
      if (this._isActive) {
        this._handleStall();
      }
    }, this._timeout);
  }

  private async _handleStall() {
    const isRecoverable = this._retryCount < this._maxRetries;

    logger.warn(
      `Stream stall detected (${Date.now() - this._lastActivity}ms since last activity, ` +
        `attempt ${this._retryCount + 1}/${this._maxRetries}, recoverable: ${isRecoverable})`,
    );

    // Notify about the stall detection
    if (this._options.onStallDetected) {
      this._options.onStallDetected(this._retryCount + 1, isRecoverable);
    }

    if (!isRecoverable) {
      logger.error(`Max retries (${this._maxRetries}) exhausted — stream unrecoverable`);

      if (this._options.onMaxRetriesReached) {
        this._options.onMaxRetriesReached(this._retryCount);
      }

      this.stop();

      return;
    }

    // Attempt recovery
    this._retryCount++;
    this._isRecovering = true;

    logger.info(`Attempting stream recovery (attempt ${this._retryCount}/${this._maxRetries})`);

    try {
      if (this._options.onRetry) {
        await this._options.onRetry(this._retryCount);
      }
    } catch (error) {
      logger.error(`Recovery attempt ${this._retryCount} failed:`, error);
    }

    /*
     * Continue monitoring — either the retry will produce activity
     * (triggering updateActivity → onRecovery) or we'll stall again
     * and try the next attempt.
     */
    if (this._isActive) {
      this._resetTimeout();
    }
  }
}
