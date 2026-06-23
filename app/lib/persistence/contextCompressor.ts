/**
 * ContextCompressor — Token-aware Context Compression
 * =====================================================
 * Manages the conversation context window by summarizing
 * older messages and file snapshots when the total token
 * count exceeds configurable limits.
 *
 * Compression strategies:
 * 1. Message summarization — collapse old messages into a summary
 * 2. File delta compression — store only changed lines
 * 3. Sliding window — keep recent N messages in full, summarize the rest
 */

import { createScopedLogger } from '~/utils/logger';
import { estimateTokens, estimateConversationTokens } from './contextGraph';

const logger = createScopedLogger('context-compressor');

/*
 * ==========================================
 * Configuration
 * ==========================================
 */

export interface CompressionConfig {
  /**
   * Maximum tokens before compression is triggered.
   * Default: 100,000 tokens (~75K words).
   */
  maxTokens: number;

  /**
   * Target token count after compression.
   * Should be significantly lower than maxTokens to avoid frequent re-compression.
   * Default: 60,000 tokens.
   */
  targetTokens: number;

  /**
   * Number of recent messages to always keep in full (never summarize).
   * Default: 20.
   */
  recentWindowSize: number;

  /**
   * Minimum number of messages before any compression is applied.
   * Default: 30.
   */
  minMessagesForCompression: number;

  /**
   * Whether to include file contents in token count.
   * Default: true.
   */
  includeFiles: boolean;
}

const DEFAULT_CONFIG: CompressionConfig = {
  maxTokens: 100_000,
  targetTokens: 60_000,
  recentWindowSize: 20,
  minMessagesForCompression: 30,
  includeFiles: true,
};

/*
 * ==========================================
 * Types
 * ==========================================
 */

export interface CompressedContext {
  /** Summary of compressed (older) messages. */
  summary: string;

  /** Messages that are kept in full (recent window). */
  recentMessages: Array<{ role: string; content: string; id?: string }>;

  /** Total messages before compression. */
  originalMessageCount: number;

  /** Number of messages that were summarized. */
  summarizedMessageCount: number;

  /** Estimated token count after compression. */
  estimatedTokens: number;

  /** Whether compression was actually needed. */
  wasCompressed: boolean;
}

export interface CompressionStats {
  /** Token count before compression. */
  tokensBefore: number;

  /** Token count after compression. */
  tokensAfter: number;

  /** Reduction percentage. */
  reductionPercent: number;

  /** Number of messages summarized. */
  messagesSummarized: number;

  /** Time taken for compression (ms). */
  durationMs: number;
}

/*
 * ==========================================
 * Core Compression
 * ==========================================
 */

/**
 * Analyze the current context and determine if compression is needed.
 */
export function analyzeContext(
  messages: Array<{ role: string; content: string }>,
  files?: Record<string, string>,
  config: Partial<CompressionConfig> = {},
): {
  needsCompression: boolean;
  estimatedTokens: number;
  messageTokens: number;
  fileTokens: number;
} {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const messageTokens = estimateConversationTokens(messages);

  let fileTokens = 0;

  if (cfg.includeFiles && files) {
    for (const content of Object.values(files)) {
      fileTokens += estimateTokens(content);
    }
  }

  const estimatedTokens = messageTokens + fileTokens;

  return {
    needsCompression: estimatedTokens > cfg.maxTokens && messages.length >= cfg.minMessagesForCompression,
    estimatedTokens,
    messageTokens,
    fileTokens,
  };
}

/**
 * Compress conversation context by summarizing older messages.
 *
 * This is a LOCAL summarization (no LLM call required).
 * It extracts key information from messages using heuristics:
 * - User requests (what the user asked for)
 * - Assistant actions (what was done)
 * - File modifications (which files changed)
 * - Errors encountered (what went wrong)
 */
export function compressContext(
  messages: Array<{ role: string; content: string; id?: string }>,
  config: Partial<CompressionConfig> = {},
): CompressedContext {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  // Check if compression is needed
  const analysis = analyzeContext(messages);

  if (!analysis.needsCompression) {
    return {
      summary: '',
      recentMessages: messages,
      originalMessageCount: messages.length,
      summarizedMessageCount: 0,
      estimatedTokens: analysis.estimatedTokens,
      wasCompressed: false,
    };
  }

  // Split messages into "to summarize" and "to keep"
  const keepCount = Math.min(cfg.recentWindowSize, messages.length);
  const toSummarize = messages.slice(0, messages.length - keepCount);
  const toKeep = messages.slice(messages.length - keepCount);

  // Build summary from older messages
  const summary = buildSummary(toSummarize);

  const estimatedTokens = estimateTokens(summary) + estimateConversationTokens(toKeep);

  const durationMs = Date.now() - startTime;

  logger.info(
    `Compressed ${toSummarize.length} messages into summary ` +
      `(${analysis.estimatedTokens} → ${estimatedTokens} tokens, ` +
      `${Math.round(((analysis.estimatedTokens - estimatedTokens) / analysis.estimatedTokens) * 100)}% reduction, ` +
      `${durationMs}ms)`,
  );

  return {
    summary,
    recentMessages: toKeep,
    originalMessageCount: messages.length,
    summarizedMessageCount: toSummarize.length,
    estimatedTokens,
    wasCompressed: true,
  };
}

/**
 * Build a structured summary from a list of messages.
 * Extracts key information without requiring an LLM.
 */
function buildSummary(messages: Array<{ role: string; content: string }>): string {
  const userRequests: string[] = [];
  const assistantActions: string[] = [];
  const fileChanges = new Set<string>();
  const errors: string[] = [];

  for (const msg of messages) {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

    if (msg.role === 'user') {
      // Extract the first meaningful line as a request summary
      const firstLine = content.split('\n').find((line) => line.trim().length > 10);

      if (firstLine) {
        const truncated = firstLine.trim().length > 200 ? firstLine.trim().slice(0, 200) + '...' : firstLine.trim();
        userRequests.push(truncated);
      }
    }

    if (msg.role === 'assistant') {
      // Extract file paths mentioned in artifact tags
      const fileMatches = content.match(/title="([^"]+)"/g);

      if (fileMatches) {
        for (const match of fileMatches) {
          const path = match.replace(/title="([^"]+)"/, '$1');
          fileChanges.add(path);
        }
      }

      // Extract action descriptions
      const actionMatches = content.match(/type="(file|shell|start)"/g);

      if (actionMatches) {
        assistantActions.push(`Performed ${actionMatches.length} actions`);
      }
    }

    // Detect errors
    if (content.toLowerCase().includes('error') || content.toLowerCase().includes('failed')) {
      const errorLine = content
        .split('\n')
        .find((line) => /error|failed|exception/i.test(line) && line.trim().length > 5 && line.trim().length < 200);

      if (errorLine) {
        errors.push(errorLine.trim());
      }
    }
  }

  // Build structured summary
  const parts: string[] = [`[Context Summary — ${messages.length} messages compressed]`];

  if (userRequests.length > 0) {
    parts.push('');
    parts.push('User requests:');

    // Keep only unique requests, max 10
    const unique = [...new Set(userRequests)].slice(0, 10);

    for (const req of unique) {
      parts.push(`• ${req}`);
    }
  }

  if (fileChanges.size > 0) {
    parts.push('');
    parts.push(`Files modified (${fileChanges.size}):`);

    const files = [...fileChanges].slice(0, 20);

    for (const file of files) {
      parts.push(`• ${file}`);
    }

    if (fileChanges.size > 20) {
      parts.push(`• ... and ${fileChanges.size - 20} more files`);
    }
  }

  if (errors.length > 0) {
    parts.push('');
    parts.push('Errors encountered:');

    const uniqueErrors = [...new Set(errors)].slice(0, 5);

    for (const err of uniqueErrors) {
      parts.push(`• ${err}`);
    }
  }

  return parts.join('\n');
}

/**
 * Get compression statistics for the current context.
 */
export function getCompressionStats(
  messages: Array<{ role: string; content: string }>,
  config: Partial<CompressionConfig> = {},
): CompressionStats & { needsCompression: boolean } {
  const analysis = analyzeContext(messages, undefined, config);

  if (!analysis.needsCompression) {
    return {
      tokensBefore: analysis.estimatedTokens,
      tokensAfter: analysis.estimatedTokens,
      reductionPercent: 0,
      messagesSummarized: 0,
      durationMs: 0,
      needsCompression: false,
    };
  }

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const keepCount = Math.min(cfg.recentWindowSize, messages.length);
  const toSummarize = messages.slice(0, messages.length - keepCount);
  const toKeep = messages.slice(messages.length - keepCount);

  const summary = buildSummary(toSummarize);
  const tokensAfter = estimateTokens(summary) + estimateConversationTokens(toKeep);

  return {
    tokensBefore: analysis.estimatedTokens,
    tokensAfter,
    reductionPercent: Math.round(((analysis.estimatedTokens - tokensAfter) / analysis.estimatedTokens) * 100),
    messagesSummarized: toSummarize.length,
    durationMs: 0,
    needsCompression: true,
  };
}

/**
 * Export the default config for UI display.
 */
export function getDefaultConfig(): CompressionConfig {
  return { ...DEFAULT_CONFIG };
}
