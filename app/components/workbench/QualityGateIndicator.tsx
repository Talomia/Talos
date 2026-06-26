import { memo } from 'react';
import { useStore } from '@nanostores/react';
import { qualityStatus, qualityChecks, type QualityCheckResult } from '~/lib/stores/quality-gate';

function QualityIndicatorIcon({ status }: { status: string }) {
  switch (status) {
    case 'passed':
      return <div className="i-ph:check-circle-fill text-positive text-lg" title="All quality checks passed" />;
    case 'failed':
      return <div className="i-ph:x-circle-fill text-negative text-lg" title="Quality checks failed" />;
    case 'checking':
      return <div className="i-ph:circle-notch animate-spin text-warning text-lg" title="Running quality checks..." />;
    case 'partial':
      return <div className="i-ph:warning-circle-fill text-warning text-lg" title="Some quality checks inconclusive" />;
    default:
      return null;
  }
}

function CheckRow({ check }: { check: QualityCheckResult }) {
  const icon =
    check.status === 'passed'
      ? 'i-ph:check text-positive'
      : check.status === 'failed'
        ? 'i-ph:x text-negative'
        : 'i-ph:minus text-ui-textTertiary';

  return (
    <div className="flex items-start gap-2 py-1">
      <div className={`${icon} text-sm mt-0.5 shrink-0`} />
      <div className="min-w-0">
        <span className="text-sm font-medium text-ui-textPrimary">{check.name}</span>
        {check.message && <p className="text-xs text-ui-textSecondary mt-0.5">{check.message}</p>}
        {check.details && (
          <pre className="text-xs text-ui-textTertiary mt-1 whitespace-pre-wrap break-words bg-ui-surface rounded px-2 py-1 max-h-20 overflow-y-auto">
            {check.details}
          </pre>
        )}
      </div>
    </div>
  );
}

export const QualityGateIndicator = memo(() => {
  const status = useStore(qualityStatus);
  const checks = useStore(qualityChecks);

  if (status === 'idle' || checks.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-ui-surface border border-ui-border">
      <QualityIndicatorIcon status={status} />
      <span className="text-xs font-medium text-ui-textSecondary">
        {status === 'checking'
          ? 'Checking...'
          : status === 'passed'
            ? 'All checks passed'
            : `${checks.filter((c) => c.status === 'failed').length} check(s) failed`}
      </span>
    </div>
  );
});

QualityGateIndicator.displayName = 'QualityGateIndicator';

export const QualityGatePanel = memo(() => {
  const status = useStore(qualityStatus);
  const checks = useStore(qualityChecks);

  if (status === 'idle' || checks.length === 0) {
    return null;
  }

  return (
    <div className="border border-ui-border rounded-lg bg-ui-background p-3 mt-2">
      <div className="flex items-center gap-2 mb-2">
        <QualityIndicatorIcon status={status} />
        <h4 className="text-sm font-semibold text-ui-textPrimary">Quality Gate</h4>
      </div>
      <div className="space-y-0.5">
        {checks.map((check, i) => (
          <CheckRow key={`${check.name}-${i}`} check={check} />
        ))}
      </div>
    </div>
  );
});

QualityGatePanel.displayName = 'QualityGatePanel';
