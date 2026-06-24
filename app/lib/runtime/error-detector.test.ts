import { describe, it, expect } from 'vitest';
import {
  classifyError,
  parseTerminalOutput,
  parseConsoleError,
  formatErrorsForAI,
  deduplicateErrors,
  type DetectedError,
} from './error-detector';

describe('classifyError', () => {
  it('classifies network errors as non-fixable', () => {
    const result = classifyError('ECONNREFUSED 127.0.0.1:3000');
    expect(result.category).toBe('network');
    expect(result.autoFixable).toBe(false);
  });

  it('classifies EADDRINUSE as network non-fixable', () => {
    const result = classifyError('EADDRINUSE: address already in use :::3000');
    expect(result.category).toBe('network');
    expect(result.autoFixable).toBe(false);
  });

  it('classifies syntax errors as fixable', () => {
    const result = classifyError('SyntaxError: Unexpected token');
    expect(result.category).toBe('syntax');
    expect(result.autoFixable).toBe(true);
  });

  it('classifies module not found as import error', () => {
    const result = classifyError('Cannot find module react-router');
    expect(result.category).toBe('import');
    expect(result.autoFixable).toBe(true);
  });

  it('classifies npm errors as dependency errors', () => {
    const result = classifyError('npm ERR ERESOLVE peer dependency conflict');
    expect(result.category).toBe('dependency');
    expect(result.autoFixable).toBe(true);
  });

  it('classifies TypeErrors as type errors', () => {
    const result = classifyError('TypeError: Cannot read property of undefined');
    expect(result.category).toBe('type');
    expect(result.autoFixable).toBe(true);
  });

  it('classifies runtime errors correctly', () => {
    const result = classifyError('ReferenceError: x is not defined');
    expect(result.category).toBe('runtime');
    expect(result.autoFixable).toBe(true);
  });

  it('classifies warnings as non-fixable', () => {
    const result = classifyError('Warning: deprecated API usage');
    expect(result.severity).toBe('warning');
    expect(result.autoFixable).toBe(false);
  });

  it('classifies fatal errors correctly', () => {
    const result = classifyError('fatal: could not create file');
    expect(result.severity).toBe('fatal');
  });
});

describe('parseTerminalOutput', () => {
  it('parses TypeScript errors', () => {
    const output = "src/index.ts(10,5): error TS2304: Cannot find name 'foo'";
    const errors = parseTerminalOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe('src/index.ts');
    expect(errors[0].line).toBe(10);
    expect(errors[0].column).toBe(5);
    expect(errors[0].message).toContain('TS2304');
  });

  it('parses Vite errors', () => {
    const output = '✘ [ERROR] Could not resolve "missing-module"';
    const errors = parseTerminalOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Could not resolve');
  });

  it('parses npm errors', () => {
    const output = 'npm ERR! code ERESOLVE';
    const errors = parseTerminalOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0].source).toBe('terminal');
  });

  it('parses Node crash errors', () => {
    const output = 'ReferenceError: myVar is not defined';
    const errors = parseTerminalOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('ReferenceError: myVar is not defined');
  });

  it('parses ESLint-style errors with file:line:col', () => {
    const output = 'src/App.tsx:15:3: error Missing return statement';
    const errors = parseTerminalOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0].file).toBe('src/App.tsx');
    expect(errors[0].line).toBe(15);
    expect(errors[0].column).toBe(3);
  });

  it('deduplicates identical errors', () => {
    const output = 'ReferenceError: x is not defined\nReferenceError: x is not defined';
    const errors = parseTerminalOutput(output);

    expect(errors).toHaveLength(1);
  });

  it('ignores empty lines', () => {
    const output = '\n\n\n';
    const errors = parseTerminalOutput(output);

    expect(errors).toHaveLength(0);
  });

  it('parses module not found errors', () => {
    const output = "Cannot find module: '@/components/Button'";
    const errors = parseTerminalOutput(output);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Module not found');
  });
});

describe('parseConsoleError', () => {
  it('creates a DetectedError from console error info', () => {
    const error = parseConsoleError({
      message: 'TypeError: Cannot read property "length" of undefined',
      filename: 'app.js',
      lineno: 42,
      colno: 10,
    });

    expect(error.source).toBe('preview');
    expect(error.file).toBe('app.js');
    expect(error.line).toBe(42);
    expect(error.column).toBe(10);
    expect(error.category).toBe('type');
  });
});

describe('formatErrorsForAI', () => {
  it('formats errors with category and severity', () => {
    const errors: DetectedError[] = [
      {
        id: 'err_1',
        source: 'terminal',
        severity: 'error',
        category: 'import',
        message: 'Cannot find module react',
        autoFixable: true,
        timestamp: Date.now(),
      },
    ];
    const result = formatErrorsForAI(errors);

    expect(result).toContain('[ERROR/import]');
    expect(result).toContain('Cannot find module react');
  });

  it('includes source for non-terminal errors', () => {
    const errors: DetectedError[] = [
      {
        id: 'err_1',
        source: 'preview',
        severity: 'error',
        category: 'runtime',
        message: 'x is not defined',
        autoFixable: true,
        timestamp: Date.now(),
      },
    ];
    const result = formatErrorsForAI(errors);

    expect(result).toContain('[source: preview]');
  });

  it('includes file location when available', () => {
    const errors: DetectedError[] = [
      {
        id: 'err_1',
        source: 'terminal',
        severity: 'error',
        category: 'syntax',
        message: 'Unexpected token',
        file: 'src/App.tsx',
        line: 10,
        column: 5,
        autoFixable: true,
        timestamp: Date.now(),
      },
    ];
    const result = formatErrorsForAI(errors);

    expect(result).toContain('(src/App.tsx:10:5)');
  });

  it('truncates at 800 chars', () => {
    const errors: DetectedError[] = Array.from({ length: 50 }, (_, i) => ({
      id: `err_${i}`,
      source: 'terminal' as const,
      severity: 'error' as const,
      category: 'unknown' as const,
      message: `Very long error message number ${i} that contributes to exceeding the character limit`,
      autoFixable: true,
      timestamp: Date.now(),
    }));
    const result = formatErrorsForAI(errors);

    expect(result.length).toBeLessThanOrEqual(800);
    expect(result).toMatch(/\.\.\.$/);
  });
});

describe('deduplicateErrors', () => {
  it('removes duplicates with same message and file', () => {
    const errors: DetectedError[] = [
      {
        id: 'err_1',
        source: 'terminal',
        severity: 'error',
        category: 'syntax',
        message: 'Unexpected token',
        file: 'src/App.tsx',
        autoFixable: true,
        timestamp: Date.now(),
      },
      {
        id: 'err_2',
        source: 'terminal',
        severity: 'error',
        category: 'syntax',
        message: 'Unexpected token',
        file: 'src/App.tsx',
        autoFixable: true,
        timestamp: Date.now(),
      },
    ];
    const result = deduplicateErrors(errors);

    expect(result).toHaveLength(1);
  });

  it('keeps errors with different files', () => {
    const errors: DetectedError[] = [
      {
        id: 'err_1',
        source: 'terminal',
        severity: 'error',
        category: 'syntax',
        message: 'Unexpected token',
        file: 'src/App.tsx',
        autoFixable: true,
        timestamp: Date.now(),
      },
      {
        id: 'err_2',
        source: 'terminal',
        severity: 'error',
        category: 'syntax',
        message: 'Unexpected token',
        file: 'src/Main.tsx',
        autoFixable: true,
        timestamp: Date.now(),
      },
    ];
    const result = deduplicateErrors(errors);

    expect(result).toHaveLength(2);
  });
});
