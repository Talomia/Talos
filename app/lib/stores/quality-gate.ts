import { atom, computed } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('QualityGate');

export type QualityStatus = 'idle' | 'checking' | 'passed' | 'failed' | 'partial';

export interface QualityCheckResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  message?: string;
  details?: string;
  timestamp: number;
}

export interface QualityReport {
  status: QualityStatus;
  checks: QualityCheckResult[];
  overallMessage: string;
  timestamp: number;
}

/*
 * ==========================================
 * Atoms
 * ==========================================
 */

export const qualityStatus = atom<QualityStatus>('idle');
export const qualityChecks = atom<QualityCheckResult[]>([]);
export const lastQualityReport = atom<QualityReport | null>(null);
export const qualityGateEnabled = atom<boolean>(true);

/**
 * Derived: true when all checks have passed.
 */
export const allChecksPassed = computed(qualityChecks, (checks) => {
  if (checks.length === 0) {
    return false;
  }

  return checks.every((c) => c.status === 'passed' || c.status === 'skipped');
});

/**
 * Derived: count of failed checks.
 */
export const failedCheckCount = computed(qualityChecks, (checks) => checks.filter((c) => c.status === 'failed').length);

/*
 * ==========================================
 * Quality Gate Runner
 * ==========================================
 */

/**
 * Run all quality checks after actions complete.
 * This is the main entry point — called from the workbench
 * when all actions in a generation cycle finish.
 */
export async function runQualityGate(context: {
  actions: Record<string, { status: string; type: string; error?: string }>;
  previewReady: boolean;
  previewError: string | null;
  terminalErrors: Array<{ message: string; severity: string; autoFixable: boolean }>;
}): Promise<QualityReport> {
  if (!qualityGateEnabled.get()) {
    return {
      status: 'passed',
      checks: [],
      overallMessage: 'Quality gate disabled',
      timestamp: Date.now(),
    };
  }

  qualityStatus.set('checking');

  const checks: QualityCheckResult[] = [];
  const now = Date.now();

  // Check 1: Action Execution — did all actions complete successfully?
  const actionEntries = Object.values(context.actions);
  const failedActions = actionEntries.filter((a) => a.status === 'failed');
  const abortedActions = actionEntries.filter((a) => a.status === 'aborted');
  const pendingActions = actionEntries.filter((a) => a.status === 'pending' || a.status === 'running');

  if (failedActions.length > 0) {
    checks.push({
      name: 'Action Execution',
      status: 'failed',
      message: `${failedActions.length} action(s) failed`,
      details: failedActions.map((a) => `[${a.type}] ${a.error || 'Unknown error'}`).join('\n'),
      timestamp: now,
    });
  } else if (abortedActions.length > 0) {
    checks.push({
      name: 'Action Execution',
      status: 'failed',
      message: `${abortedActions.length} action(s) were aborted`,
      timestamp: now,
    });
  } else if (pendingActions.length > 0) {
    checks.push({
      name: 'Action Execution',
      status: 'failed',
      message: `${pendingActions.length} action(s) still pending`,
      timestamp: now,
    });
  } else if (actionEntries.length > 0) {
    checks.push({
      name: 'Action Execution',
      status: 'passed',
      message: `${actionEntries.length} action(s) completed successfully`,
      timestamp: now,
    });
  } else {
    checks.push({
      name: 'Action Execution',
      status: 'skipped',
      message: 'No actions to execute',
      timestamp: now,
    });
  }

  // Check 2: Build Errors — are there terminal errors from the build/dev server?
  const buildErrors = context.terminalErrors.filter((e) => e.severity === 'fatal' || e.severity === 'error');

  if (buildErrors.length > 0) {
    const autoFixable = buildErrors.filter((e) => e.autoFixable);
    const nonFixable = buildErrors.filter((e) => !e.autoFixable);

    checks.push({
      name: 'Build Health',
      status: 'failed',
      message: `${buildErrors.length} build error(s) detected${autoFixable.length > 0 ? ` (${autoFixable.length} auto-fixable)` : ''}`,
      details: buildErrors
        .slice(0, 5)
        .map((e) => e.message)
        .join('\n'),
      timestamp: now,
    });

    if (nonFixable.length > 0) {
      logger.warn(`${nonFixable.length} non-auto-fixable build errors detected`);
    }
  } else {
    checks.push({
      name: 'Build Health',
      status: 'passed',
      message: 'No build errors detected',
      timestamp: now,
    });
  }

  // Check 3: Preview Status — did the preview iframe load?
  if (context.previewError) {
    checks.push({
      name: 'Preview Load',
      status: 'failed',
      message: 'Preview failed to load',
      details: context.previewError,
      timestamp: now,
    });
  } else if (context.previewReady) {
    checks.push({
      name: 'Preview Load',
      status: 'passed',
      message: 'Preview loaded successfully',
      timestamp: now,
    });
  } else {
    checks.push({
      name: 'Preview Load',
      status: 'skipped',
      message: 'No preview available (app may still be starting)',
      timestamp: now,
    });
  }

  // Check 4: Runtime Errors — are there any uncaught exceptions in the preview?
  const runtimeErrors = context.terminalErrors.filter(
    (e) => e.severity === 'fatal' && (e.message.includes('uncaught') || e.message.includes('unhandled')),
  );

  if (runtimeErrors.length > 0) {
    checks.push({
      name: 'Runtime Stability',
      status: 'failed',
      message: `${runtimeErrors.length} runtime error(s) detected`,
      details: runtimeErrors
        .slice(0, 3)
        .map((e) => e.message)
        .join('\n'),
      timestamp: now,
    });
  } else {
    checks.push({
      name: 'Runtime Stability',
      status: 'passed',
      message: 'No runtime errors detected',
      timestamp: now,
    });
  }

  // Compute overall status
  const hasFailures = checks.some((c) => c.status === 'failed');
  const allPassed = checks.every((c) => c.status === 'passed' || c.status === 'skipped');
  const status: QualityStatus = allPassed ? 'passed' : hasFailures ? 'failed' : 'partial';

  const report: QualityReport = {
    status,
    checks,
    overallMessage: formatOverallMessage(status, checks),
    timestamp: now,
  };

  qualityStatus.set(status);
  qualityChecks.set(checks);
  lastQualityReport.set(report);

  logger.info(`Quality gate: ${status} (${checks.length} checks, ${failedCheckCount.get()} failed)`);

  return report;
}

/**
 * Format the quality report into a human-readable string
 * suitable for display in the UI or as an AI prompt.
 */
export function formatQualityReportForAI(report: QualityReport): string {
  const lines: string[] = ['## Quality Gate Report', ''];

  for (const check of report.checks) {
    const icon = check.status === 'passed' ? '✅' : check.status === 'failed' ? '❌' : '⏭️';
    lines.push(`${icon} **${check.name}**: ${check.message}`);

    if (check.details) {
      lines.push('```');
      lines.push(check.details);
      lines.push('```');
    }
  }

  lines.push('');
  lines.push(`**Overall**: ${report.overallMessage}`);

  return lines.join('\n');
}

/**
 * Reset the quality gate state.
 */
export function resetQualityGate(): void {
  qualityStatus.set('idle');
  qualityChecks.set([]);
}

/*
 * ==========================================
 * Helpers
 * ==========================================
 */

function formatOverallMessage(status: QualityStatus, checks: QualityCheckResult[]): string {
  const failed = checks.filter((c) => c.status === 'failed');

  switch (status) {
    case 'passed':
      return 'All quality checks passed — the generated app appears functional.';
    case 'failed':
      return `${failed.length} quality check(s) failed: ${failed.map((f) => f.name).join(', ')}. The generated app may not work correctly.`;
    case 'partial':
      return 'Some quality checks could not be verified. The app may need manual review.';
    default:
      return 'Quality gate has not run yet.';
  }
}
