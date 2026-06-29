import React, { memo } from 'react';
import { useStore } from '@nanostores/react';
import { syncStatus, lastSyncTime, cloudEnabled } from '~/lib/persistence/cloudSync';
import { classNames } from '~/utils/classNames';
import WithTooltip from '~/components/ui/Tooltip';

/**
 * Small icon indicator for cloud sync status.
 * Only visible when the user is authenticated and cloud sync is active.
 */
export const CloudSyncStatus = memo(() => {
  const status = useStore(syncStatus);
  const lastSync = useStore(lastSyncTime);
  const enabled = useStore(cloudEnabled);

  if (!enabled) {
    return null;
  }

  const config: Record<typeof status, { icon: string; color: string; label: string }> = {
    idle: {
      icon: 'i-ph:cloud text-sm',
      color: 'text-ui-textTertiary',
      label: 'Cloud sync idle',
    },
    syncing: {
      icon: 'i-ph:cloud-arrow-up text-sm',
      color: 'text-blue-500 dark:text-blue-400 animate-pulse',
      label: 'Syncing…',
    },
    synced: {
      icon: 'i-ph:cloud-check text-sm',
      color: 'text-green-500 dark:text-green-400',
      label: 'Synced',
    },
    error: {
      icon: 'i-ph:cloud-warning text-sm',
      color: 'text-red-500 dark:text-red-400',
      label: 'Sync failed',
    },
  };

  const { icon, color, label } = config[status];

  const tooltipText = lastSync ? `${label} · Last sync: ${formatRelativeTime(lastSync)}` : label;

  return (
    <WithTooltip tooltip={tooltipText}>
      <div
        className={classNames('flex items-center justify-center w-6 h-6 rounded cursor-default', color)}
        aria-label={tooltipText}
      >
        <div className={icon} />
      </div>
    </WithTooltip>
  );
});

/** Format a timestamp as a relative time string, e.g., "2 min ago". */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) {
    return 'just now';
  }

  if (diffSec < 60) {
    return `${diffSec}s ago`;
  }

  const diffMin = Math.floor(diffSec / 60);

  if (diffMin < 60) {
    return `${diffMin} min ago`;
  }

  const diffHour = Math.floor(diffMin / 60);

  if (diffHour < 24) {
    return `${diffHour}h ago`;
  }

  return new Date(timestamp).toLocaleDateString();
}
