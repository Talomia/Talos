import { memo } from 'react';
import { isMac } from '~/utils/os';

export const WorkbenchWelcome = memo(() => {
  const mod = isMac ? '⌘' : 'Ctrl';

  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-4 p-8">
      <div className="i-ph:code text-5xl text-gray-300 dark:text-gray-700" />
      <h3 className="text-lg font-medium text-gray-400 dark:text-gray-500">No file selected</h3>
      <div className="flex flex-col gap-2 text-sm text-gray-400 dark:text-gray-600">
        <span>
          Press{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-mono text-xs">
            {mod}+P
          </kbd>{' '}
          to open a file
        </span>
        <span>
          Press{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-mono text-xs">
            {mod}+K
          </kbd>{' '}
          for commands
        </span>
        <span>
          Press{' '}
          <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-mono text-xs">
            {mod}+B
          </kbd>{' '}
          to toggle sidebar
        </span>
      </div>
    </div>
  );
});
