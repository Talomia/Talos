export const lineNumberStyles =
  'w-9 shrink-0 pl-2 py-1 text-left font-mono text-bolt-elements-textTertiary border-r border-bolt-elements-borderColor bg-bolt-elements-background-depth-1';
export const lineContentStyles =
  'px-1 py-1 font-mono whitespace-pre flex-1 group-hover:bg-bolt-elements-background-depth-2 text-bolt-elements-textPrimary';
export const diffPanelStyles = 'h-full overflow-auto diff-panel-content';

// Updated color styles for better consistency
export const diffLineStyles = {
  added: 'bg-green-500/10 dark:bg-green-500/20 border-l-4 border-green-500',
  removed: 'bg-red-500/10 dark:bg-red-500/20 border-l-4 border-red-500',
  unchanged: '',
};

export const changeColorStyles = {
  added: 'text-green-700 dark:text-green-500 bg-green-500/10 dark:bg-green-500/20',
  removed: 'text-red-700 dark:text-red-500 bg-red-500/10 dark:bg-red-500/20',
  unchanged: 'text-bolt-elements-textPrimary',
};
