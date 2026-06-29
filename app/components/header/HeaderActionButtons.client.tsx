import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';
import { Button } from '~/components/ui/Button';
import { DeployButton } from '~/components/deploy/DeployButton';
import { TokenUsageIndicator } from '~/components/chat/TokenUsageIndicator';
import { CloudSyncStatus } from '~/components/chat/CloudSyncStatus';

const logger = createScopedLogger('HeaderActionButtons');

interface HeaderActionButtonsProps {
  chatStarted: boolean;
}

export function HeaderActionButtons({ chatStarted }: HeaderActionButtonsProps) {
  const activePreviewIndex = 0;
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[activePreviewIndex];

  const shouldShowButtons = activePreview;

  return (
    <div className="flex items-center gap-2">
      {/* Token Usage & Sync Status — always visible when chat is active */}
      {chatStarted && (
        <div className="flex items-center gap-1.5">
          <CloudSyncStatus />
          <TokenUsageIndicator />
        </div>
      )}

      {/* Deploy Button */}
      {shouldShowButtons && <DeployButton />}

      {/* Debug Tools */}
      {shouldShowButtons && (
        <div className="flex border border-ui-borderColor rounded-lg overflow-hidden text-sm">
          <Button
            onClick={() => window.open('https://github.com/Talomia/Talos/issues/new', '_blank', 'noopener,noreferrer')}
            variant="primary"
            size="xs"
            className="rounded-none rounded-l-lg gap-1.5"
            title="Report Bug"
          >
            <div className="i-ph:bug" />
            <span>Report Bug</span>
          </Button>
          <div className="w-px bg-ui-borderColor" />
          <Button
            onClick={async () => {
              try {
                const { downloadDebugLog } = await import('~/utils/debugLogger');
                await downloadDebugLog();
              } catch (error) {
                logger.error('Failed to download debug log:', error);
              }
            }}
            variant="primary"
            size="xs"
            className="rounded-none rounded-r-lg gap-1.5"
            title="Download Debug Log"
          >
            <div className="i-ph:download" />
            <span>Debug Log</span>
          </Button>
        </div>
      )}
    </div>
  );
}
