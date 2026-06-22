import React, { useEffect, useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { isMac } from '~/utils/os';

interface ShortcutEntry {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

function getShortcutGroups(): ShortcutGroup[] {
  const mod = isMac ? '⌘' : 'Ctrl';

  return [
    {
      title: 'Navigation',
      shortcuts: [
        { keys: [`${mod}+K`], description: 'Open command palette' },
        { keys: [`${mod}+N`], description: 'New chat' },
        { keys: [`${mod}+P`], description: 'Quick open file' },
        { keys: [`${mod}+B`], description: 'Toggle sidebar' },
        { keys: [`${mod}+\\`], description: 'Toggle workbench' },
        { keys: ['/'], description: 'Focus chat input' },
        { keys: ['Esc'], description: 'Close dialog / palette' },
        { keys: ['?'], description: 'Show this help' },
      ],
    },
    {
      title: 'Chat',
      shortcuts: [
        { keys: ['Enter'], description: 'Send message' },
        { keys: ['Shift+Enter'], description: 'New line in message' },
        { keys: [`${mod}+Shift+F`], description: 'Search in conversation' },
      ],
    },
    {
      title: 'Command Palette',
      shortcuts: [
        { keys: ['↑', '↓'], description: 'Navigate results' },
        { keys: ['Enter'], description: 'Execute selected command' },
        { keys: ['Esc'], description: 'Close palette' },
      ],
    },
    {
      title: `Workbench (via ${mod}+K)`,
      shortcuts: [
        { keys: [`${mod}+K`, '→ workbench'], description: 'Toggle workbench panel' },
        { keys: [`${mod}+K`, '→ terminal'], description: 'Toggle terminal' },
        { keys: [`${mod}+K`, '→ code'], description: 'Switch to code view' },
        { keys: [`${mod}+K`, '→ preview'], description: 'Switch to preview' },
      ],
    },
    {
      title: 'Appearance',
      shortcuts: [{ keys: [`${mod}+Alt+Shift+D`], description: 'Toggle theme' }],
    },
  ];
}

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }

      const tag = (e.target as HTMLElement)?.tagName;

      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      e.preventDefault();
      setOpen(true);
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const groups = getShortcutGroups();

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-max bg-black/50 backdrop-blur-sm animate-fade-in" />
        <RadixDialog.Content className="fixed top-[15vh] left-1/2 -translate-x-1/2 z-max w-full max-w-[480px] bg-white dark:bg-gray-950 rounded-xl border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
            <RadixDialog.Title className="text-base font-semibold text-ui-textPrimary">
              Keyboard Shortcuts
            </RadixDialog.Title>
            <RadixDialog.Close className="p-1 rounded-md text-ui-textTertiary hover:text-ui-textPrimary hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <span className="i-ph:x text-lg" />
            </RadixDialog.Close>
          </div>

          <RadixDialog.Description className="sr-only">
            A list of all available keyboard shortcuts organized by category.
          </RadixDialog.Description>

          {/* Shortcut Groups */}
          <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-5">
            {groups.map((group) => (
              <div key={group.title}>
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                  {group.title}
                </h3>
                <div className="space-y-1.5">
                  {group.shortcuts.map((shortcut) => (
                    <div key={shortcut.description} className="flex items-center justify-between py-1.5 text-sm">
                      <span className="text-ui-textSecondary">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key) => (
                          <kbd
                            key={key}
                            className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded text-[11px] font-mono font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                          >
                            {key}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-400 dark:text-gray-500 text-center">
            Press{' '}
            <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 font-mono text-[10px]">
              ?
            </kbd>{' '}
            anywhere to toggle this panel
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
