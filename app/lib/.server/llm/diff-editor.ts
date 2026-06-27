/**
 * Diff Editor — Surgical File Editing via Unified Diffs
 * ======================================================
 * Allows the AI to output targeted diffs instead of full file
 * rewrites. Parses unified diff format and applies patches to
 * existing files. Falls back to full-file write on patch failure.
 *
 * This saves massive token budget — a 500-line file with a 2-line
 * change only needs ~10 lines of diff output instead of 500 lines.
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('diff-editor');

export interface DiffHunk {
  /** Starting line in the original file (1-indexed) */
  originalStart: number;

  /** Number of lines from the original file */
  originalCount: number;

  /** Starting line in the new file (1-indexed) */
  newStart: number;

  /** Number of lines in the new file */
  newCount: number;

  /** The diff lines (prefixed with +, -, or space) */
  lines: string[];
}

export interface ParsedDiff {
  filePath: string;
  hunks: DiffHunk[];
  isNewFile: boolean;
  isDeleteFile: boolean;
}

export interface PatchResult {
  success: boolean;
  content: string;
  error?: string;
  hunksApplied: number;
  hunksFailed: number;
}

/**
 * Parse a unified diff string into structured hunks.
 * Supports standard unified diff format:
 * ```
 * --- a/path/to/file
 * +++ b/path/to/file
 * @@ -start,count +start,count @@
 *  context line
 * -removed line
 * +added line
 * ```
 */
export function parseUnifiedDiff(diffText: string): ParsedDiff[] {
  const diffs: ParsedDiff[] = [];
  const lines = diffText.split('\n');
  let i = 0;

  while (i < lines.length) {
    // Look for --- line
    if (lines[i]?.startsWith('--- ')) {
      const oldPath = lines[i].replace(/^--- [ab]\//, '').trim();
      i++;

      if (i < lines.length && lines[i]?.startsWith('+++ ')) {
        const newPath = lines[i].replace(/^\+\+\+ [ab]\//, '').trim();
        i++;

        const isNewFile = oldPath === '/dev/null';
        const isDeleteFile = newPath === '/dev/null';
        const filePath = isNewFile ? newPath : oldPath;

        const hunks: DiffHunk[] = [];

        // Parse hunks
        while (i < lines.length && lines[i]?.startsWith('@@ ')) {
          const hunkHeader = lines[i].match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);

          if (hunkHeader) {
            const hunk: DiffHunk = {
              originalStart: parseInt(hunkHeader[1], 10),
              originalCount: parseInt(hunkHeader[2] || '1', 10),
              newStart: parseInt(hunkHeader[3], 10),
              newCount: parseInt(hunkHeader[4] || '1', 10),
              lines: [],
            };

            i++;

            // Collect hunk lines
            while (i < lines.length && !lines[i]?.startsWith('@@ ') && !lines[i]?.startsWith('--- ')) {
              const line = lines[i];

              if (line?.startsWith('+') || line?.startsWith('-') || line?.startsWith(' ') || line === '') {
                hunk.lines.push(line);
              } else {
                // End of hunk
                break;
              }

              i++;
            }

            hunks.push(hunk);
          } else {
            i++;
          }
        }

        if (hunks.length > 0) {
          diffs.push({ filePath, hunks, isNewFile, isDeleteFile });
        }
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  return diffs;
}

/**
 * Apply a parsed diff to file content.
 * Attempts to apply all hunks. If a hunk fails, it tries fuzzy matching
 * (searching nearby lines for the context). Returns the patched content
 * and statistics about which hunks succeeded.
 */
export function applyDiff(originalContent: string, diff: ParsedDiff): PatchResult {
  if (diff.isNewFile) {
    // For new files, the diff contains only additions
    const newContent = diff.hunks
      .flatMap((h) => h.lines)
      .filter((l) => l.startsWith('+'))
      .map((l) => l.slice(1))
      .join('\n');

    return {
      success: true,
      content: newContent,
      hunksApplied: diff.hunks.length,
      hunksFailed: 0,
    };
  }

  if (diff.isDeleteFile) {
    return {
      success: true,
      content: '',
      hunksApplied: diff.hunks.length,
      hunksFailed: 0,
    };
  }

  const originalLines = originalContent.split('\n');
  let result = [...originalLines];
  let offset = 0;
  let hunksApplied = 0;
  let hunksFailed = 0;

  for (const hunk of diff.hunks) {
    const applied = applyHunk(result, hunk, offset);

    if (applied.success) {
      result = applied.lines;
      offset = applied.newOffset;
      hunksApplied++;
    } else {
      // Try fuzzy matching — search ±10 lines for the context
      const fuzzyResult = applyHunkFuzzy(result, hunk, offset, 10);

      if (fuzzyResult.success) {
        result = fuzzyResult.lines;
        offset = fuzzyResult.newOffset;
        hunksApplied++;
        logger.debug(`Hunk at line ${hunk.originalStart} applied via fuzzy match (offset ${fuzzyResult.fuzzyOffset})`);
      } else {
        hunksFailed++;
        logger.warn(`Failed to apply hunk at line ${hunk.originalStart}: context mismatch`);
      }
    }
  }

  return {
    success: hunksFailed === 0,
    content: result.join('\n'),
    hunksApplied,
    hunksFailed,
    error: hunksFailed > 0 ? `${hunksFailed} hunk(s) failed to apply` : undefined,
  };
}

interface HunkApplyResult {
  success: boolean;
  lines: string[];
  newOffset: number;
  fuzzyOffset?: number;
}

/**
 * Apply a single hunk at the expected position.
 */
function applyHunk(lines: string[], hunk: DiffHunk, offset: number): HunkApplyResult {
  const startIdx = hunk.originalStart - 1 + offset;

  // Verify context matches
  const contextLines = hunk.lines.filter((l) => l.startsWith(' ') || l.startsWith('-'));

  for (let i = 0; i < contextLines.length; i++) {
    const expected = contextLines[i].slice(1); // remove prefix
    const actual = lines[startIdx + i];

    if (actual === undefined || actual !== expected) {
      return { success: false, lines, newOffset: offset };
    }
  }

  // Apply the hunk
  const newLines = [...lines];
  const removeCount = hunk.lines.filter((l) => l.startsWith(' ') || l.startsWith('-')).length;
  const insertLines = hunk.lines.filter((l) => l.startsWith('+') || l.startsWith(' ')).map((l) => l.slice(1));

  newLines.splice(startIdx, removeCount, ...insertLines);

  const newOffset = offset + (insertLines.length - removeCount);

  return { success: true, lines: newLines, newOffset };
}

/**
 * Try to apply a hunk with fuzzy matching — search nearby lines for the context.
 */
function applyHunkFuzzy(
  lines: string[],
  hunk: DiffHunk,
  offset: number,
  searchRange: number,
): HunkApplyResult & { fuzzyOffset?: number } {
  const baseIdx = hunk.originalStart - 1 + offset;

  for (let delta = -searchRange; delta <= searchRange; delta++) {
    if (delta === 0) {
      continue;
    } // Already tried exact match

    const tryIdx = baseIdx + delta;

    if (tryIdx < 0 || tryIdx >= lines.length) {
      continue;
    }

    // Create a hunk with adjusted start
    const adjustedHunk = {
      ...hunk,
      originalStart: tryIdx + 1 - offset,
    };

    const result = applyHunk(lines, adjustedHunk, offset);

    if (result.success) {
      return { ...result, fuzzyOffset: delta };
    }
  }

  return { success: false, lines, newOffset: offset };
}

/**
 * Detect if a string looks like a unified diff.
 */
export function isDiffContent(content: string): boolean {
  return content.includes('--- ') && content.includes('+++ ') && content.includes('@@ ');
}
