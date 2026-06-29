import React, { useCallback, useState } from 'react';
import { Dialog, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { classNames } from '~/utils/classNames';

export interface ExportFormat {
  id: string;
  label: string;
  icon: string;
  handler: () => void;
}

export interface ExportButtonProps {
  exportFormats: ExportFormat[];
}

export const ExportButton = ({ exportFormats }: ExportButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
  }, []);

  const handleFormatClick = useCallback((handler: () => void) => {
    handler();
    setIsOpen(false);
  }, []);

  return (
    <DialogRoot open={isOpen} onOpenChange={handleOpenChange}>
      <button
        onClick={() => setIsOpen(true)}
        className={classNames(
          'group flex items-center gap-2',
          'rounded-lg px-3 py-1.5',
          'text-sm text-ui-textPrimary',
          'bg-ui-background-depth-2',
          'border border-ui-borderColor',
          'hover:bg-accent-500/10 dark:hover:bg-accent-500/20',
          'transition-all duration-200',
        )}
      >
        <span className="i-ph:download text-lg text-ui-textTertiary group-hover:text-accent-500 transition-colors" />
        Export
      </button>

      <Dialog showCloseButton>
        <div className="p-6">
          <DialogTitle className="flex items-center gap-2">
            <div className="i-ph:download w-5 h-5" />
            Export Event Logs
          </DialogTitle>

          <div className="mt-4 flex flex-col gap-2">
            {exportFormats.map((format) => (
              <button
                key={format.id}
                onClick={() => handleFormatClick(format.handler)}
                className={classNames(
                  'flex items-center gap-3 px-4 py-3 text-sm rounded-lg transition-colors w-full text-left',
                  'bg-white dark:bg-[#0A0A0A]',
                  'border border-ui-borderColor',
                  'hover:bg-accent-50 dark:hover:bg-[#1a1a1a]',
                  'hover:border-accent-200 dark:hover:border-accent-900/30',
                  'text-ui-textPrimary',
                )}
              >
                <div className={classNames(format.icon, 'w-5 h-5')} />
                <div>
                  <div className="font-medium">{format.label}</div>
                  <div className="text-xs text-ui-textSecondary mt-0.5">
                    {format.id === 'json' && 'Export as a structured JSON file'}
                    {format.id === 'csv' && 'Export as a CSV spreadsheet'}
                    {format.id === 'pdf' && 'Export as a formatted PDF document'}
                    {format.id === 'txt' && 'Export as a formatted text file'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
};
