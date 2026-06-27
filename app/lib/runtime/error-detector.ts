export interface DetectedError {
  id: string;
  source: 'terminal' | 'preview' | 'build';
  severity: 'fatal' | 'error' | 'warning';
  category: 'syntax' | 'import' | 'runtime' | 'type' | 'dependency' | 'network' | 'unknown';
  message: string;
  file?: string;
  line?: number;
  column?: number;
  stack?: string;
  autoFixable: boolean;
  timestamp: number;
}

function simpleHash(str: string): string {
  let hash = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
}

function generateErrorId(message: string, file?: string): string {
  return `err_${simpleHash((message || '') + (file || ''))}`;
}

export function classifyError(message: string): {
  severity: DetectedError['severity'];
  category: DetectedError['category'];
  autoFixable: boolean;
} {
  const msg = message.toLowerCase();

  // Network errors — not auto-fixable
  if (
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('fetch failed') ||
    msg.includes('network error') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout')
  ) {
    return { severity: 'error', category: 'network', autoFixable: false };
  }

  // Port conflicts — not auto-fixable
  if (msg.includes('eaddrinuse')) {
    return { severity: 'error', category: 'network', autoFixable: false };
  }

  // Syntax errors
  if (
    msg.includes('syntaxerror') ||
    msg.includes('unexpected token') ||
    msg.includes('parsing error') ||
    msg.includes('unterminated string') ||
    msg.includes('unexpected end of')
  ) {
    return { severity: 'error', category: 'syntax', autoFixable: true };
  }

  // Import / module errors
  if (
    msg.includes('cannot find module') ||
    msg.includes('module not found') ||
    msg.includes('module build failed') ||
    msg.includes('failed to resolve') ||
    msg.includes('could not resolve')
  ) {
    return { severity: 'error', category: 'import', autoFixable: true };
  }

  // Dependency errors
  if (
    msg.includes('peer dep') ||
    msg.includes('eresolve') ||
    msg.includes('missing dependency') ||
    msg.includes('npm err') ||
    msg.includes('npm error')
  ) {
    return { severity: 'error', category: 'dependency', autoFixable: true };
  }

  // Type errors
  if (msg.includes('typeerror') || /error ts\d+:/.test(msg) || msg.includes('type error')) {
    return { severity: 'error', category: 'type', autoFixable: true };
  }

  // Runtime errors
  if (
    msg.includes('referenceerror') ||
    msg.includes('rangeerror') ||
    msg.includes('is not defined') ||
    msg.includes('is not a function') ||
    msg.includes('cannot read propert')
  ) {
    return { severity: 'error', category: 'runtime', autoFixable: true };
  }

  // Fatal indicators
  if (msg.includes('fatal') || msg.includes('segmentation fault') || msg.includes('killed')) {
    return { severity: 'fatal', category: 'unknown', autoFixable: true };
  }

  // Warning indicators
  if (msg.includes('warning') || msg.includes('deprecat')) {
    return { severity: 'warning', category: 'unknown', autoFixable: false };
  }

  return { severity: 'error', category: 'unknown', autoFixable: true };
}

// Error line patterns for terminal output parsing
const ERROR_PATTERNS: Array<{
  regex: RegExp;
  extract: (match: RegExpMatchArray, line: string) => Partial<DetectedError>;
}> = [
  // Vite/esbuild: "✘ [ERROR]" lines
  {
    regex: /✘\s*\[ERROR\]\s*(.*)/,
    extract: (match) => ({ message: match[1].trim() }),
  },

  // Vite/esbuild: "ERROR" at start of line
  {
    regex: /^ERROR\s+(.*)/,
    extract: (match) => ({ message: match[1].trim() }),
  },

  // Vite "x]" error pattern
  {
    regex: /^x\]\s*(.*)/,
    extract: (match) => ({ message: match[1].trim() }),
  },

  // TypeScript: "error TS1234:"
  {
    regex: /^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.*)/,
    extract: (match) => ({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      message: `${match[4]}: ${match[5]}`,
    }),
  },

  // ESLint-style: "file:line:col" pattern
  {
    regex: /^(.+?):(\d+):(\d+):\s*(error|warning)\s+(.*)/,
    extract: (match) => ({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      message: match[5],
    }),
  },

  // npm: "ERR!" or "npm error"
  {
    regex: /(?:npm\s+ERR!|npm\s+error)\s*(.*)/i,
    extract: (match) => ({ message: match[1].trim() }),
  },

  // Node crashes: "SyntaxError:", "ReferenceError:", "TypeError:"
  {
    regex: /^(SyntaxError|ReferenceError|TypeError|RangeError|URIError|EvalError):\s*(.*)/,
    extract: (match) => ({ message: `${match[1]}: ${match[2]}` }),
  },

  // Module not found
  {
    regex: /(?:Cannot find module|Module not found)[:\s]+'?([^']+)'?/,
    extract: (match) => ({ message: `Module not found: ${match[1]}` }),
  },

  // Port conflicts
  {
    regex: /EADDRINUSE[:\s]*(.*)/,
    extract: (match) => ({ message: `Port in use: ${match[1] || 'address already in use'}` }),
  },

  // Vite/Rollup build errors: "[vite]: Rollup failed to resolve import"
  {
    regex: /\[vite\][:\s]*(?:Rollup\s+)?(?:failed to resolve|Internal server error)[:\s]*(.*)/i,
    extract: (match) => ({ message: `Vite: ${match[1].trim()}` }),
  },

  // React hydration/rendering errors
  {
    regex: /(Hydration failed|Text content did not match|There was an error while hydrating)[.:\s]*(.*)/,
    extract: (match) => ({ message: `${match[1]}${match[2] ? ': ' + match[2].trim() : ''}` }),
  },

  // ESM import errors
  {
    regex: /(?:does not provide an export named|is not exported from|Named export .+ not found)/,
    extract: (_match, line) => ({ message: line.trim() }),
  },

  // pnpm/yarn errors
  {
    regex: /(?:ERR_PNPM_|WARN.*deprecated|error.*ERESOLVE)\s*(.*)/i,
    extract: (match) => ({ message: match[1]?.trim() || match[0].trim() }),
  },

  // Next.js server component errors
  {
    regex: /(?:Server Component|"use client"|"use server").*(?:error|cannot|invalid)/i,
    extract: (_match, line) => ({ message: line.trim() }),
  },

  // Tailwind CSS / PostCSS errors
  {
    regex: /(?:CssSyntaxError|postcss|tailwindcss)[:\s]+(.*)/i,
    extract: (match) => ({ message: `CSS: ${match[1].trim()}` }),
  },

  // Webpack/Turbopack compilation errors
  {
    regex: /(?:Module build failed|webpack|turbopack).*(?:error|failed)[:\s]*(.*)/i,
    extract: (match) => ({ message: match[1]?.trim() || match[0].trim() }),
  },

  // Process exit with non-zero code
  {
    regex: /(?:process exited with code|exit code|exited with)\s*(\d+)/i,
    extract: (match) => ({ message: `Process exited with code ${match[1]}` }),
  },
];

export function parseTerminalOutput(output: string): DetectedError[] {
  const errors: DetectedError[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    for (const pattern of ERROR_PATTERNS) {
      const match = trimmed.match(pattern.regex);

      if (match) {
        const extracted = pattern.extract(match, trimmed);
        const message = extracted.message || trimmed;
        const classification = classifyError(message);

        errors.push({
          id: generateErrorId(message, extracted.file),
          source: 'terminal',
          severity: classification.severity,
          category: classification.category,
          message,
          file: extracted.file,
          line: extracted.line,
          column: extracted.column,
          autoFixable: classification.autoFixable,
          timestamp: Date.now(),
        });

        break; // Only match the first pattern per line
      }
    }
  }

  return deduplicateErrors(errors);
}

export function parseConsoleError(error: {
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
}): DetectedError {
  const classification = classifyError(error.message);

  return {
    id: generateErrorId(error.message, error.filename),
    source: 'preview',
    severity: classification.severity,
    category: classification.category,
    message: error.message,
    file: error.filename,
    line: error.lineno,
    column: error.colno,
    stack: error.stack,
    autoFixable: classification.autoFixable,
    timestamp: Date.now(),
  };
}

export function formatErrorsForAI(errors: DetectedError[]): string {
  const unique = deduplicateErrors(errors);
  const parts: string[] = [];

  for (const err of unique) {
    let entry = `[${err.severity.toUpperCase()}/${err.category}] ${err.message}`;

    if (err.file) {
      entry += ` (${err.file}`;

      if (err.line) {
        entry += `:${err.line}`;

        if (err.column) {
          entry += `:${err.column}`;
        }
      }

      entry += ')';
    }

    if (err.source !== 'terminal') {
      entry += ` [source: ${err.source}]`;
    }

    parts.push(entry);
  }

  let summary = parts.join('\n');

  // Keep under 800 chars to give model more error context
  if (summary.length > 800) {
    summary = summary.slice(0, 797) + '...';
  }

  return summary;
}

export function deduplicateErrors(errors: DetectedError[]): DetectedError[] {
  const seen = new Map<string, DetectedError>();

  for (const error of errors) {
    const key = `${error.message}::${error.file || ''}`;

    if (!seen.has(key)) {
      seen.set(key, error);
    }
  }

  return Array.from(seen.values());
}

/*
 * ---------------------------------------------------------------------------
 * Error Chain Analysis
 * ---------------------------------------------------------------------------
 */

export interface ErrorChain {
  /** The root-cause error that likely triggered downstream failures. */
  root: DetectedError;

  /** Errors that are downstream consequences of the root error. */
  related: DetectedError[];
}

/**
 * Dependency weight used to sort categories so root causes surface first.
 * Lower values represent errors that are more likely to be root causes.
 */
const CATEGORY_PRIORITY: Record<DetectedError['category'], number> = {
  dependency: 0,
  import: 1,
  syntax: 2,
  type: 3,
  runtime: 4,
  network: 5,
  unknown: 6,
};

/**
 * Severity weight — fatal / error errors should be addressed before warnings.
 */
const SEVERITY_PRIORITY: Record<DetectedError['severity'], number> = {
  fatal: 0,
  error: 1,
  warning: 2,
};

/**
 * Check whether `cause` could plausibly trigger `effect`.
 * The heuristic is intentionally conservative — it links errors that share a
 * file or module name *and* follow a logical category ordering (e.g., an
 * import error in a file can cause type / runtime errors in the same file).
 */
function couldCause(cause: DetectedError, effect: DetectedError): boolean {
  // Same error can't cause itself
  if (cause.id === effect.id) {
    return false;
  }

  // A lower-priority category can cause a higher-priority one
  if (CATEGORY_PRIORITY[cause.category] >= CATEGORY_PRIORITY[effect.category]) {
    return false;
  }

  // Same file — very likely related
  if (cause.file && effect.file && cause.file === effect.file) {
    return true;
  }

  // Module reference in the effect's message matches the cause's file
  if (cause.file && effect.message.includes(cause.file)) {
    return true;
  }

  // Dependency errors cause import errors for any module
  if (cause.category === 'dependency' && effect.category === 'import') {
    return true;
  }

  // Import errors cause type/runtime errors when module is missing
  if (cause.category === 'import' && (effect.category === 'type' || effect.category === 'runtime')) {
    return true;
  }

  return false;
}

/**
 * Group related errors into chains. Each chain has a single root-cause error
 * and zero or more downstream errors that are consequences of that root cause.
 *
 * Errors that don't relate to any other error appear as standalone chains with
 * an empty `related` array.
 */
export function analyzeErrorChain(errors: DetectedError[]): ErrorChain[] {
  if (errors.length === 0) {
    return [];
  }

  // Sort so likely root causes come first
  const sorted = [...errors].sort((a, b) => {
    const catDiff = CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category];

    if (catDiff !== 0) {
      return catDiff;
    }

    return SEVERITY_PRIORITY[a.severity] - SEVERITY_PRIORITY[b.severity];
  });

  const assigned = new Set<string>();
  const chains: ErrorChain[] = [];

  for (const candidate of sorted) {
    if (assigned.has(candidate.id)) {
      continue;
    }

    const related: DetectedError[] = [];

    for (const other of sorted) {
      if (assigned.has(other.id) || other.id === candidate.id) {
        continue;
      }

      if (couldCause(candidate, other)) {
        related.push(other);
        assigned.add(other.id);
      }
    }

    assigned.add(candidate.id);

    chains.push({ root: candidate, related });
  }

  return chains;
}

/**
 * Order errors by dependency so that root causes appear first.
 *
 * This is the recommended order in which to attempt auto-fixes: addressing a
 * root cause often resolves its downstream effects automatically.
 */
export function suggestFixOrder(errors: DetectedError[]): DetectedError[] {
  const chains = analyzeErrorChain(errors);
  const ordered: DetectedError[] = [];

  for (const chain of chains) {
    ordered.push(chain.root);

    for (const related of chain.related) {
      ordered.push(related);
    }
  }

  return ordered;
}
