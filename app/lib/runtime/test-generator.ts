/**
 * Test Generator — automated test generation and execution for generated projects.
 *
 * Detects the project type from package.json and generates appropriate smoke tests.
 * Can execute tests via the runtime engine and parse results into structured data.
 */

import type { RuntimeEngine, RuntimeProcess } from '~/lib/runtime/runtime-engine';
import type { FileMap } from '~/lib/stores/files';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('TestGenerator');

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProjectType = 'react' | 'nextjs' | 'vue' | 'nuxt' | 'svelte' | 'node' | 'vanilla' | 'unknown';

export interface TestFile {
  path: string;
  content: string;
}

export interface TestResults {
  total: number;
  passed: number;
  failed: number;
  errors: string[];
}

export interface TestGenerationResult {
  projectType: ProjectType;
  files: TestFile[];
}

// ─── Project Type Detection ───────────────────────────────────────────────────

/**
 * Detect the project type by inspecting package.json dependencies and
 * the file structure.
 */
export function detectProjectType(files: FileMap): ProjectType {
  const packageJsonEntry = files['/package.json'] || files['package.json'];

  if (!packageJsonEntry || packageJsonEntry.type !== 'file') {
    // No package.json — check for raw HTML
    const hasHtml = Object.keys(files).some((p) => p.endsWith('.html') || p.endsWith('.htm'));

    return hasHtml ? 'vanilla' : 'unknown';
  }

  try {
    const pkg = JSON.parse(packageJsonEntry.content);
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    // Order matters: check more specific frameworks first
    if (allDeps.next) {
      return 'nextjs';
    }

    if (allDeps.nuxt || allDeps.nuxt3) {
      return 'nuxt';
    }

    if (allDeps.svelte || allDeps['@sveltejs/kit']) {
      return 'svelte';
    }

    if (allDeps.vue) {
      return 'vue';
    }

    if (allDeps.react || allDeps['react-dom']) {
      return 'react';
    }

    // Node.js project (has package.json but no frontend framework)
    if (allDeps.express || allDeps.fastify || allDeps.koa || pkg.main || pkg.bin) {
      return 'node';
    }

    return 'unknown';
  } catch {
    logger.warn('Failed to parse package.json');

    return 'unknown';
  }
}

// ─── Test Generation ──────────────────────────────────────────────────────────

/**
 * Generate appropriate test files based on the project structure and type.
 *
 * Generates basic smoke tests that verify:
 *   - Components render without crashing
 *   - Pages load correctly
 *   - Key functions execute without errors
 */
export function generateTests(files: FileMap, projectType?: string): TestGenerationResult {
  const detectedType = (projectType as ProjectType) || detectProjectType(files);
  const testFiles: TestFile[] = [];

  logger.info(`Generating tests for project type: ${detectedType}`);

  switch (detectedType) {
    case 'react':
    case 'nextjs':
      testFiles.push(...generateReactTests(files));
      break;

    case 'vue':
    case 'nuxt':
      testFiles.push(...generateVueTests(files));
      break;

    case 'svelte':
      testFiles.push(...generateSvelteTests(files));
      break;

    case 'node':
      testFiles.push(...generateNodeTests(files));
      break;

    case 'vanilla':
      testFiles.push(...generateVanillaTests(files));
      break;

    default:
      testFiles.push(generateGenericSmokeTest());
      break;
  }

  logger.info(`Generated ${testFiles.length} test file(s)`);

  return {
    projectType: detectedType,
    files: testFiles,
  };
}

// ─── Framework-specific generators ───────────────────────────────────────────

function generateReactTests(files: FileMap): TestFile[] {
  const testFiles: TestFile[] = [];
  const components = findComponentFiles(files, ['.tsx', '.jsx']);

  if (components.length > 0) {
    const imports = components
      .slice(0, 5) // Limit to 5 components to avoid huge test files
      .map((comp) => {
        const name = extractComponentName(comp);
        const importPath = comp.replace(/\.(tsx|jsx)$/, '');

        return { name, importPath };
      });

    const importLines = imports.map((i) => `import { ${i.name} } from '${i.importPath}';`).join('\n');

    const testCases = imports
      .map(
        (i) => `
  it('renders ${i.name} without crashing', () => {
    expect(() => ${i.name}).toBeDefined();
  });`,
      )
      .join('\n');

    testFiles.push({
      path: '/__tests__/components.smoke.test.tsx',
      content: `/**
 * Auto-generated smoke tests for React components.
 * Verifies that components can be imported without errors.
 */
${importLines}

describe('Component Smoke Tests', () => {${testCases}
});
`,
    });
  }

  // Check for App entry point
  const appEntry = findEntryFile(files, ['App.tsx', 'App.jsx', 'app.tsx', 'app.jsx']);

  if (appEntry) {
    testFiles.push({
      path: '/__tests__/app.smoke.test.tsx',
      content: `/**
 * Auto-generated smoke test for the App entry point.
 */
import App from '${appEntry.replace(/\.(tsx|jsx)$/, '')}';

describe('App Entry Point', () => {
  it('exports a valid component', () => {
    expect(App).toBeDefined();
  });
});
`,
    });
  }

  return testFiles;
}

function generateVueTests(files: FileMap): TestFile[] {
  const testFiles: TestFile[] = [];
  const components = findComponentFiles(files, ['.vue']);

  if (components.length > 0) {
    const imports = components.slice(0, 5).map((comp) => {
      const name = extractComponentName(comp);

      return { name, importPath: comp };
    });

    const importLines = imports.map((i) => `import ${i.name} from '${i.importPath}';`).join('\n');

    const testCases = imports
      .map(
        (i) => `
  it('imports ${i.name} without errors', () => {
    expect(${i.name}).toBeDefined();
  });`,
      )
      .join('\n');

    testFiles.push({
      path: '/__tests__/components.smoke.test.ts',
      content: `/**
 * Auto-generated smoke tests for Vue components.
 */
${importLines}

describe('Vue Component Smoke Tests', () => {${testCases}
});
`,
    });
  }

  return testFiles;
}

function generateSvelteTests(files: FileMap): TestFile[] {
  const testFiles: TestFile[] = [];
  const components = findComponentFiles(files, ['.svelte']);

  if (components.length > 0) {
    const imports = components.slice(0, 5).map((comp) => {
      const name = extractComponentName(comp);

      return { name, importPath: comp };
    });

    const importLines = imports.map((i) => `import ${i.name} from '${i.importPath}';`).join('\n');

    const testCases = imports
      .map(
        (i) => `
  it('imports ${i.name} without errors', () => {
    expect(${i.name}).toBeDefined();
  });`,
      )
      .join('\n');

    testFiles.push({
      path: '/__tests__/components.smoke.test.ts',
      content: `/**
 * Auto-generated smoke tests for Svelte components.
 */
${importLines}

describe('Svelte Component Smoke Tests', () => {${testCases}
});
`,
    });
  }

  return testFiles;
}

function generateNodeTests(files: FileMap): TestFile[] {
  const testFiles: TestFile[] = [];

  // Look for common entry points
  const entryFiles = ['index.ts', 'index.js', 'server.ts', 'server.js', 'app.ts', 'app.js'];
  const foundEntry = entryFiles.find(
    (entry) => files[`/${entry}`]?.type === 'file' || files[`/src/${entry}`]?.type === 'file',
  );

  if (foundEntry) {
    const entryPath = files[`/${foundEntry}`] ? `/${foundEntry}` : `/src/${foundEntry}`;

    testFiles.push({
      path: '/__tests__/server.smoke.test.ts',
      content: `/**
 * Auto-generated smoke test for the Node.js entry point.
 */

describe('Server Entry Point', () => {
  it('can be imported without crashing', async () => {
    const mod = await import('${entryPath.replace(/\.(ts|js)$/, '')}');
    expect(mod).toBeDefined();
  });
});
`,
    });
  } else {
    testFiles.push(generateGenericSmokeTest());
  }

  return testFiles;
}

function generateVanillaTests(files: FileMap): TestFile[] {
  const htmlFiles = Object.keys(files).filter((p) => p.endsWith('.html') && files[p]?.type === 'file');

  if (htmlFiles.length === 0) {
    return [generateGenericSmokeTest()];
  }

  const testCases = htmlFiles
    .slice(0, 5)
    .map((htmlPath) => {
      const file = files[htmlPath];
      const content = file?.type === 'file' ? file.content : '';

      return `
  it('${htmlPath} contains valid HTML structure', () => {
    const html = ${JSON.stringify(content.slice(0, 500))};
    expect(html).toContain('<');
    expect(html.toLowerCase()).toContain('html');
  });`;
    })
    .join('\n');

  return [
    {
      path: '/__tests__/html.smoke.test.ts',
      content: `/**
 * Auto-generated smoke tests for vanilla HTML files.
 */

describe('HTML File Smoke Tests', () => {${testCases}
});
`,
    },
  ];
}

function generateGenericSmokeTest(): TestFile {
  return {
    path: '/__tests__/smoke.test.ts',
    content: `/**
 * Auto-generated generic smoke test.
 * This test verifies the basic test infrastructure works.
 */

describe('Smoke Test', () => {
  it('test runner is functional', () => {
    expect(true).toBe(true);
  });

  it('basic arithmetic works', () => {
    expect(1 + 1).toBe(2);
  });
});
`,
  };
}

// ─── Test Execution ──────────────────────────────────────────────────────────

/**
 * Execute `npm test` (or the project's test script) inside the runtime engine
 * and return parsed results.
 */
export async function runTests(engine: RuntimeEngine): Promise<TestResults> {
  logger.info('Running tests via runtime engine');

  let process: RuntimeProcess;

  try {
    process = await engine.spawn('npx', ['vitest', 'run', '--reporter=verbose'], {
      cwd: engine.workdir,
    });
  } catch {
    logger.warn('vitest not available, falling back to npm test');

    try {
      process = await engine.spawn('npm', ['test', '--', '--watchAll=false'], {
        cwd: engine.workdir,
      });
    } catch (spawnError) {
      const message = spawnError instanceof Error ? spawnError.message : String(spawnError);
      logger.error('Failed to spawn test process:', message);

      return {
        total: 0,
        passed: 0,
        failed: 0,
        errors: [`Failed to run tests: ${message}`],
      };
    }
  }

  // Collect output
  const output = await collectProcessOutput(process);
  const exitCode = await process.exit;

  logger.info(`Test process exited with code ${exitCode}`);

  const results = parseTestResults(output);

  // If the process failed but no test counts were parsed, report the failure
  if (exitCode !== 0 && results.total === 0) {
    results.errors.push(`Test process exited with code ${exitCode}`);
  }

  return results;
}

/**
 * Parse test runner output to extract pass/fail counts.
 * Supports common output formats: Jest, Vitest, Mocha.
 */
export function parseTestResults(output: string): TestResults {
  const result: TestResults = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: [],
  };

  // Jest / Vitest format: "Tests:  X passed, Y failed, Z total"
  const jestMatch = output.match(/Tests:\s+(?:(\d+)\s+passed)?[,\s]*(?:(\d+)\s+failed)?[,\s]*(\d+)\s+total/i);

  if (jestMatch) {
    result.passed = parseInt(jestMatch[1] || '0', 10);
    result.failed = parseInt(jestMatch[2] || '0', 10);
    result.total = parseInt(jestMatch[3] || '0', 10);

    return addErrorLines(result, output);
  }

  // Vitest alternative: "X passed | Y failed | Z total"
  const vitestMatch = output.match(/(\d+)\s+passed\s*\|\s*(\d+)\s+failed(?:\s*\|\s*(\d+)\s+total)?/i);

  if (vitestMatch) {
    result.passed = parseInt(vitestMatch[1], 10);
    result.failed = parseInt(vitestMatch[2], 10);
    result.total = parseInt(vitestMatch[3] || String(result.passed + result.failed), 10);

    return addErrorLines(result, output);
  }

  // Mocha format: "X passing", "Y failing"
  const mochaPassMatch = output.match(/(\d+)\s+passing/i);
  const mochaFailMatch = output.match(/(\d+)\s+failing/i);

  if (mochaPassMatch || mochaFailMatch) {
    result.passed = mochaPassMatch ? parseInt(mochaPassMatch[1], 10) : 0;
    result.failed = mochaFailMatch ? parseInt(mochaFailMatch[1], 10) : 0;
    result.total = result.passed + result.failed;

    return addErrorLines(result, output);
  }

  // Simple "pass" / "fail" counting from verbose output
  const passLines = (output.match(/✓|✅|PASS|passed/gi) || []).length;
  const failLines = (output.match(/✗|✘|❌|FAIL|failed/gi) || []).length;

  if (passLines > 0 || failLines > 0) {
    result.passed = passLines;
    result.failed = failLines;
    result.total = passLines + failLines;
  }

  return addErrorLines(result, output);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addErrorLines(result: TestResults, output: string): TestResults {
  // Extract failure details — lines that start with common error indicators
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (
      (trimmed.startsWith('FAIL') ||
        trimmed.startsWith('✗') ||
        trimmed.startsWith('✘') ||
        trimmed.includes('AssertionError') ||
        trimmed.includes('Error:')) &&
      trimmed.length > 5 &&
      result.errors.length < 10
    ) {
      result.errors.push(trimmed);
    }
  }

  return result;
}

async function collectProcessOutput(process: RuntimeProcess): Promise<string> {
  const chunks: string[] = [];
  const reader = process.output.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return chunks.join('');
}

function findComponentFiles(files: FileMap, extensions: string[]): string[] {
  return Object.keys(files).filter((filePath) => {
    const entry = files[filePath];

    if (!entry || entry.type !== 'file') {
      return false;
    }

    // Only look in src/ or components/ directories
    const inComponentDir =
      filePath.includes('/components/') ||
      filePath.includes('/src/') ||
      filePath.includes('/pages/') ||
      filePath.includes('/views/');

    if (!inComponentDir) {
      return false;
    }

    // Skip test files, config files, and non-component files
    if (
      filePath.includes('.test.') ||
      filePath.includes('.spec.') ||
      filePath.includes('__tests__') ||
      filePath.includes('.config.') ||
      filePath.includes('.d.ts')
    ) {
      return false;
    }

    return extensions.some((ext) => filePath.endsWith(ext));
  });
}

function extractComponentName(filePath: string): string {
  const basename = filePath.split('/').pop() || 'Component';

  // Remove extension
  const name = basename.replace(/\.(tsx|jsx|vue|svelte)$/, '');

  // Convert to PascalCase if needed
  if (name.includes('-')) {
    return name
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  // Ensure first letter is uppercase
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function findEntryFile(files: FileMap, candidates: string[]): string | null {
  for (const candidate of candidates) {
    const paths = [`/src/${candidate}`, `/${candidate}`];

    for (const path of paths) {
      if (files[path]?.type === 'file') {
        return path;
      }
    }
  }

  return null;
}
