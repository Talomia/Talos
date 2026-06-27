import { createScopedLogger } from '~/utils/logger';
import type { DetectedError } from './error-detector';
import type { FileMap } from '~/lib/stores/files';

const logger = createScopedLogger('FixStrategy');

export interface RootCause {
  category:
    | 'missing-import'
    | 'type-mismatch'
    | 'missing-dependency'
    | 'syntax-error'
    | 'runtime-null'
    | 'api-misuse'
    | 'config-error'
    | 'style-error'
    | 'state-error';
  confidence: 'high' | 'medium' | 'low';
  description: string;
  suggestedFix: string;
  affectedFiles: string[];
}

export interface FixResult {
  fixed: boolean;
  newErrors: DetectedError[];
  regressions: boolean;
  attempts: number;
}

/*
 * ---------------------------------------------------------------------------
 * Root-Cause Classification
 * ---------------------------------------------------------------------------
 */

const IMPORT_PATTERNS = [
  /cannot find module[:\s]+'?([^']+)'?/i,
  /module not found[:\s]+'?([^']+)'?/i,
  /failed to resolve[:\s]+'?([^']+)'?/i,
  /could not resolve[:\s]*"?([^"]+)"?/i,
  /does not provide an export named '?([^']+)'?/i,
  /is not exported from '?([^']+)'?/i,
];

const DEPENDENCY_PATTERNS = [/npm\s+err/i, /eresolve/i, /peer dep/i, /missing dependency/i, /err_pnpm/i];

const SYNTAX_PATTERNS = [
  /syntaxerror/i,
  /unexpected token/i,
  /parsing error/i,
  /unterminated string/i,
  /unexpected end of/i,
];

const TYPE_PATTERNS = [
  /error ts\d+:/i,
  /type '([^']+)' is not assignable to type '([^']+)'/i,
  /property '([^']+)' does not exist on type/i,
  /argument of type '([^']+)' is not assignable/i,
  /type error/i,
];

const NULL_PATTERNS = [
  /cannot read propert/i,
  /is undefined/i,
  /is null/i,
  /null reference/i,
  /typeerror:.*undefined/i,
  /typeerror:.*null/i,
];

const API_MISUSE_PATTERNS = [
  /is not a function/i,
  /expected \d+ arguments?,? but got \d+/i,
  /not assignable to parameter/i,
  /is not defined/i,
];

const CONFIG_PATTERNS = [
  /\[vite\]/i,
  /webpack/i,
  /turbopack/i,
  /postcss/i,
  /tailwindcss.*config/i,
  /tsconfig/i,
  /next\.config/i,
  /rollup/i,
  /esbuild/i,
];

const STYLE_PATTERNS = [
  /csssyntaxerror/i,
  /postcss/i,
  /tailwindcss/i,
  /unknown word/i,
  /invalid css/i,
  /css\s+parse\s+error/i,
];

const STATE_PATTERNS = [
  /rendered more hooks/i,
  /hooks can only be called/i,
  /invalid hook call/i,
  /cannot update.*during.*render/i,
  /too many re-renders/i,
  /use client/i,
  /server component.*use(?:state|effect|ref)/i,
];

function matchesAny(message: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(message));
}

function extractModuleName(message: string): string | undefined {
  for (const pattern of IMPORT_PATTERNS) {
    const match = message.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return undefined;
}

function extractTypePair(message: string): { expected?: string; received?: string } {
  const assignable = message.match(/type '([^']+)' is not assignable to type '([^']+)'/i);

  if (assignable) {
    return { received: assignable[1], expected: assignable[2] };
  }

  const argument = message.match(/argument of type '([^']+)' is not assignable to parameter of type '([^']+)'/i);

  if (argument) {
    return { received: argument[1], expected: argument[2] };
  }

  return {};
}

function fileContentContains(files: FileMap, fileName: string, pattern: RegExp): boolean {
  for (const [filePath, dirent] of Object.entries(files)) {
    if (!dirent || dirent.type !== 'file') {
      continue;
    }

    if (filePath.includes(fileName) && pattern.test(dirent.content)) {
      return true;
    }
  }

  return false;
}

export function classifyRootCause(error: DetectedError, files: FileMap): RootCause {
  const msg = error.message;
  const affectedFiles = error.file ? [error.file] : [];

  // State errors (React hooks) — check early, they can look like runtime errors
  if (matchesAny(msg, STATE_PATTERNS)) {
    logger.debug('Classified as state-error', error.id);

    return {
      category: 'state-error',
      confidence: 'high',
      description: `React state/hook misuse: ${msg}`,
      suggestedFix: 'Move hook call to a valid component body or add "use client" directive',
      affectedFiles,
    };
  }

  // Style / CSS errors
  if (matchesAny(msg, STYLE_PATTERNS)) {
    logger.debug('Classified as style-error', error.id);

    return {
      category: 'style-error',
      confidence: 'high',
      description: `CSS/styling issue: ${msg}`,
      suggestedFix: 'Fix the CSS syntax or configuration',
      affectedFiles,
    };
  }

  // Missing dependency (npm-level)
  if (error.category === 'dependency' || matchesAny(msg, DEPENDENCY_PATTERNS)) {
    logger.debug('Classified as missing-dependency', error.id);

    return {
      category: 'missing-dependency',
      confidence: 'high',
      description: `npm dependency issue: ${msg}`,
      suggestedFix: 'Run npm/pnpm install to resolve missing dependencies',
      affectedFiles,
    };
  }

  // Missing import — module resolution failure
  if (error.category === 'import' || matchesAny(msg, IMPORT_PATTERNS)) {
    const moduleName = extractModuleName(msg);
    const isInstalled = moduleName
      ? fileContentContains(files, 'package.json', new RegExp(`"${moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`))
      : false;

    if (moduleName && !isInstalled) {
      logger.debug('Classified as missing-dependency (uninstalled package)', error.id);

      return {
        category: 'missing-dependency',
        confidence: 'high',
        description: `Package "${moduleName}" is not installed`,
        suggestedFix: `Run npm install ${moduleName}`,
        affectedFiles,
      };
    }

    logger.debug('Classified as missing-import', error.id);

    return {
      category: 'missing-import',
      confidence: moduleName ? 'high' : 'medium',
      description: moduleName ? `Module "${moduleName}" cannot be resolved` : `Import resolution failure: ${msg}`,
      suggestedFix: moduleName ? `Add the import for ${moduleName}` : 'Add or fix the missing import statement',
      affectedFiles,
    };
  }

  // Syntax errors
  if (error.category === 'syntax' || matchesAny(msg, SYNTAX_PATTERNS)) {
    const location = error.file && error.line ? ` at ${error.file}:${error.line}` : '';

    logger.debug('Classified as syntax-error', error.id);

    return {
      category: 'syntax-error',
      confidence: 'high',
      description: `Syntax error${location}: ${msg}`,
      suggestedFix: `Fix the syntax error${location}: ${msg}`,
      affectedFiles,
    };
  }

  // Type mismatch — TypeScript type errors
  if (error.category === 'type' || matchesAny(msg, TYPE_PATTERNS)) {
    const { expected, received } = extractTypePair(msg);
    const location = error.file && error.line ? ` at ${error.file}:${error.line}` : '';

    logger.debug('Classified as type-mismatch', error.id);

    return {
      category: 'type-mismatch',
      confidence: expected ? 'high' : 'medium',
      description:
        expected && received
          ? `Type "${received}" is not assignable to type "${expected}"${location}`
          : `TypeScript type error${location}: ${msg}`,
      suggestedFix:
        expected && received
          ? `The function expects type ${expected} but received type ${received}. Fix the type${location}`
          : `Fix the type error${location}`,
      affectedFiles,
    };
  }

  // Runtime null/undefined access
  if (matchesAny(msg, NULL_PATTERNS)) {
    logger.debug('Classified as runtime-null', error.id);

    return {
      category: 'runtime-null',
      confidence: 'high',
      description: `Null/undefined access: ${msg}`,
      suggestedFix: 'Add null/undefined check before accessing the property',
      affectedFiles,
    };
  }

  // API misuse (wrong signature, not-a-function, etc.)
  if (error.category === 'runtime' || matchesAny(msg, API_MISUSE_PATTERNS)) {
    logger.debug('Classified as api-misuse', error.id);

    return {
      category: 'api-misuse',
      confidence: 'medium',
      description: `API misuse: ${msg}`,
      suggestedFix: 'Check the function signature and correct the usage',
      affectedFiles,
    };
  }

  // Config errors (build tool issues)
  if (matchesAny(msg, CONFIG_PATTERNS)) {
    logger.debug('Classified as config-error', error.id);

    return {
      category: 'config-error',
      confidence: 'medium',
      description: `Build/bundler configuration issue: ${msg}`,
      suggestedFix: 'Review and fix the build configuration file',
      affectedFiles,
    };
  }

  // Fallback — low confidence
  logger.debug('Could not classify root cause, falling back to syntax-error', error.id);

  return {
    category: 'syntax-error',
    confidence: 'low',
    description: `Unclassified error: ${msg}`,
    suggestedFix: `Investigate and fix: ${msg}`,
    affectedFiles,
  };
}

/*
 * ---------------------------------------------------------------------------
 * Targeted Fix Generation
 * ---------------------------------------------------------------------------
 */

const FIX_PROMPT_BUILDERS: Record<RootCause['category'], (rc: RootCause, err: DetectedError) => string> = {
  'missing-import': (rc, err) => {
    const moduleName = extractModuleName(err.message);
    const location = err.file ? ` in ${err.file}` : '';

    return moduleName
      ? `Add the import for "${moduleName}"${location}. Ensure the module path is correct and the export exists.`
      : `Fix the missing import${location}: ${rc.description}`;
  },

  'missing-dependency': (_rc, err) => {
    const moduleName = extractModuleName(err.message);

    return moduleName
      ? `Run npm install ${moduleName} — the package is not in package.json.`
      : `Install the missing npm dependency: ${err.message}`;
  },

  'type-mismatch': (rc, err) => {
    const { expected, received } = extractTypePair(err.message);
    const location = err.file && err.line ? ` at ${err.file}:${err.line}` : '';

    return expected && received
      ? `The function expects type ${expected} but received type ${received}. Fix the type${location}.`
      : `Fix the TypeScript type error${location}: ${err.message}`;
  },

  'syntax-error': (_rc, err) => {
    const location = err.file && err.line ? ` at ${err.file}:${err.line}` : '';

    return `Fix the syntax error${location}: ${err.message}`;
  },

  'runtime-null': (_rc, err) => {
    const location = err.file && err.line ? ` at ${err.file}:${err.line}` : '';

    return `Add a null/undefined guard${location}. The error is: ${err.message}`;
  },

  'api-misuse': (_rc, err) => {
    const location = err.file && err.line ? ` at ${err.file}:${err.line}` : '';

    return `Correct the function call${location}: ${err.message}. Check the expected signature and arguments.`;
  },

  'config-error': (rc, _err) => {
    return `Fix the build/bundler configuration: ${rc.description}`;
  },

  'style-error': (_rc, err) => {
    const location = err.file && err.line ? ` at ${err.file}:${err.line}` : '';

    return `Fix the CSS/styling issue${location}: ${err.message}`;
  },

  'state-error': (_rc, err) => {
    const location = err.file && err.line ? ` at ${err.file}:${err.line}` : '';

    return `Fix the React state/hook misuse${location}: ${err.message}. Ensure hooks are called at the top level of a component or custom hook.`;
  },
};

export function generateFixPrompt(rootCause: RootCause, error: DetectedError, contextFiles: FileMap): string {
  const builder = FIX_PROMPT_BUILDERS[rootCause.category];
  let prompt = builder(rootCause, error);

  // Append relevant file context hints
  const relevantPaths = rootCause.affectedFiles.filter((f) => {
    const dirent = contextFiles[f];

    return dirent?.type === 'file';
  });

  if (relevantPaths.length > 0) {
    prompt += `\nAffected file${relevantPaths.length > 1 ? 's' : ''}: ${relevantPaths.join(', ')}`;
  }

  logger.debug('Generated fix prompt', prompt);

  return prompt;
}

/*
 * ---------------------------------------------------------------------------
 * Fix Verification
 * ---------------------------------------------------------------------------
 */

export function verifyFix(originalError: DetectedError, newErrors: DetectedError[], attempts: number = 1): FixResult {
  const originalStillPresent = newErrors.some(
    (e) => e.message === originalError.message && e.file === originalError.file,
  );

  // Errors that weren't in the original set
  const regressionErrors = newErrors.filter(
    (e) => e.message !== originalError.message || e.file !== originalError.file,
  );

  const result: FixResult = {
    fixed: !originalStillPresent,
    newErrors: regressionErrors,
    regressions: regressionErrors.length > 0,
    attempts,
  };

  if (result.fixed) {
    logger.debug('Fix verified — original error resolved', originalError.id);
  } else {
    logger.debug('Fix did not resolve original error', originalError.id);
  }

  if (result.regressions) {
    logger.debug(`Fix introduced ${regressionErrors.length} new error(s)`);
  }

  return result;
}
