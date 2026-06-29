import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { useStore } from '@nanostores/react';
import { useNavigate } from '@remix-run/react';
import { themeStore, toggleTheme } from '~/lib/stores/theme';
import { getAll, getDb, type ChatHistoryItem } from '~/lib/persistence';
import { workbenchStore } from '~/lib/stores/workbench';
import { chatStore } from '~/lib/stores/chat';

interface Command {
  id: string;
  group: string;
  icon: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;

  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) {
      qi++;
    }
  }

  return qi === q.length;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [chats, setChats] = useState<ChatHistoryItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const theme = useStore(themeStore);
  const navigate = useNavigate();

  // Global keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load chats when palette opens
  useEffect(() => {
    if (!open) {
      return;
    }

    setQuery('');
    setSelectedIndex(0);

    getDb().then(async (db) => {
      if (!db) {
        return;
      }

      try {
        const allChats = await getAll(db);
        const sorted = allChats
          .filter((c) => c.urlId && c.description)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setChats(sorted);
      } catch {
        // Silent fail
      }
    });
  }, [open]);

  const runAndClose = useCallback(
    (action: () => void) => {
      action();
      setOpen(false);
    },
    [setOpen],
  );

  // Static commands
  const commands: Command[] = useMemo(
    () => [
      {
        id: 'new-chat',
        group: 'Navigation',
        icon: 'i-ph:plus-circle',
        label: 'New Chat',
        shortcut: '⌘N',
        action: () =>
          runAndClose(() => {
            window.location.href = '/';
          }),
      },
      {
        id: 'focus-chat',
        group: 'Navigation',
        icon: 'i-ph:cursor-text',
        label: 'Focus Chat Input',
        shortcut: '/',
        action: () =>
          runAndClose(() => {
            const textarea = document.querySelector('textarea[aria-label="Chat message input"]') as HTMLTextAreaElement;
            textarea?.focus();
          }),
      },
      {
        id: 'toggle-theme',
        group: 'Appearance',
        icon: theme === 'dark' ? 'i-ph:sun' : 'i-ph:moon',
        label: theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode',
        action: () => runAndClose(toggleTheme),
      },
      {
        id: 'open-settings',
        group: 'Tools',
        icon: 'i-ph:gear-six',
        label: 'Open Settings',
        action: () =>
          runAndClose(() => {
            window.dispatchEvent(new CustomEvent('talos:open-settings'));
          }),
      },
      {
        id: 'keyboard-shortcuts',
        group: 'Tools',
        icon: 'i-ph:keyboard',
        label: 'Keyboard Shortcuts',
        shortcut: '?',
        action: () =>
          runAndClose(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
          }),
      },
      {
        id: 'quick-open',
        group: 'Workbench',
        icon: 'i-ph:file-magnifying-glass',
        label: 'Quick Open File',
        shortcut: '⌘P',
        action: () =>
          runAndClose(() => {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', metaKey: true }));
          }),
      },
      {
        id: 'toggle-workbench',
        group: 'Workbench',
        icon: 'i-ph:code',
        label: workbenchStore.showWorkbench.get() ? 'Hide Workbench' : 'Show Workbench',
        action: () => runAndClose(() => workbenchStore.showWorkbench.set(!workbenchStore.showWorkbench.get())),
      },
      {
        id: 'toggle-terminal',
        group: 'Workbench',
        icon: 'i-ph:terminal',
        label: 'Toggle Terminal',
        action: () => runAndClose(() => workbenchStore.toggleTerminal()),
      },
      {
        id: 'view-code',
        group: 'Workbench',
        icon: 'i-ph:file-code',
        label: 'Switch to Code View',
        action: () =>
          runAndClose(() => {
            workbenchStore.currentView.set('code');
          }),
      },
      {
        id: 'view-diff',
        group: 'Workbench',
        icon: 'i-ph:git-diff',
        label: 'Switch to Diff View',
        action: () =>
          runAndClose(() => {
            workbenchStore.currentView.set('diff');
          }),
      },
      {
        id: 'view-preview',
        group: 'Workbench',
        icon: 'i-ph:browser',
        label: 'Switch to Preview',
        action: () =>
          runAndClose(() => {
            workbenchStore.currentView.set('preview');
          }),
      },
      {
        id: 'toggle-chat',
        group: 'Navigation',
        icon: 'i-ph:chat-circle',
        label: chatStore.get().showChat ? 'Hide Chat Panel' : 'Show Chat Panel',
        action: () => runAndClose(() => chatStore.setKey('showChat', !chatStore.get().showChat)),
      },
      {
        id: 'export-markdown',
        group: 'Tools',
        icon: 'i-ph:file-arrow-down',
        label: 'Export Chat as Markdown',
        action: () =>
          runAndClose(() => {
            window.dispatchEvent(new CustomEvent('talos:export-markdown'));
          }),
      },
      {
        id: 'export-json',
        group: 'Tools',
        icon: 'i-ph:file-js',
        label: 'Export Chat as JSON',
        action: () =>
          runAndClose(() => {
            window.dispatchEvent(new CustomEvent('talos:export-json'));
          }),
      },
      {
        id: 'toggle-sidebar',
        group: 'Navigation',
        icon: 'i-ph:sidebar',
        label: 'Toggle Sidebar',
        shortcut: '⌘B',
        action: () =>
          runAndClose(() => {
            window.dispatchEvent(new CustomEvent('talos:toggle-sidebar'));
          }),
      },
      {
        id: 'search-chat',
        group: 'Navigation',
        icon: 'i-ph:magnifying-glass',
        label: 'Search in Chat',
        shortcut: '⌘F',
        action: () =>
          runAndClose(() => {
            window.dispatchEvent(new CustomEvent('talos:toggle-chat-search'));
          }),
      },
    ],
    [theme, navigate, runAndClose],
  );

  // Filter commands + chats
  const filteredCommands = useMemo(() => {
    if (!query) {
      return commands;
    }

    return commands.filter((cmd) => fuzzyMatch(cmd.label, query));
  }, [commands, query]);

  const filteredChats = useMemo(() => {
    if (!query) {
      return chats.slice(0, 5);
    }

    return chats.filter((c) => fuzzyMatch(c.description || '', query)).slice(0, 5);
  }, [chats, query]);

  // Combine into a flat list for keyboard navigation
  const allItems = useMemo(() => {
    const items: Array<{ type: 'command'; data: Command } | { type: 'chat'; data: ChatHistoryItem }> = [];

    for (const cmd of filteredCommands) {
      items.push({ type: 'command', data: cmd });
    }

    for (const chat of filteredChats) {
      items.push({ type: 'chat', data: chat });
    }

    return items;
  }, [filteredCommands, filteredChats]);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [allItems.length]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) {
      return;
    }

    const selected = listRef.current.querySelector('[data-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const executeItem = useCallback(
    (index: number) => {
      const item = allItems[index];

      if (!item) {
        return;
      }

      if (item.type === 'command') {
        item.data.action();
      } else {
        navigate(`/chat/${item.data.urlId || item.data.id}`);
        setOpen(false);
      }
    },
    [allItems, navigate],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev < allItems.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allItems.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        executeItem(selectedIndex);
        break;
    }
  }

  // Group commands for rendering
  const commandGroups = useMemo(() => {
    const groups: Record<string, Command[]> = {};

    for (const cmd of filteredCommands) {
      if (!groups[cmd.group]) {
        groups[cmd.group] = [];
      }

      groups[cmd.group].push(cmd);
    }

    return groups;
  }, [filteredCommands]);

  // Track cumulative index for keyboard selection
  let itemIndex = -1;

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-max bg-black/50 backdrop-blur-sm animate-fade-in" />
        <RadixDialog.Content
          className="fixed top-[20vh] left-1/2 -translate-x-1/2 z-max w-full max-w-[520px] bg-ui-background-depth-1 rounded-xl border border-ui-borderColor shadow-2xl overflow-hidden animate-scale-in"
          onKeyDown={handleKeyDown}
        >
          {/* Search Input */}
          <div className="flex items-center gap-3 px-4 border-b border-ui-borderColor">
            <span className="i-ph:magnifying-glass text-ui-textTertiary text-lg flex-shrink-0" />
            <RadixDialog.Title className="sr-only">Command Palette</RadixDialog.Title>
            <RadixDialog.Description className="sr-only">
              Search commands and chats. Use arrow keys to navigate, Enter to select.
            </RadixDialog.Description>
            <input
              ref={inputRef}
              type="text"
              className="flex-1 py-3.5 bg-transparent text-sm text-ui-textPrimary placeholder-ui-textTertiary outline-none"
              placeholder="Search commands and chats..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-ui-textTertiary bg-ui-background-depth-3 border border-ui-borderColor">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[340px] overflow-y-auto py-2" role="listbox">
            {allItems.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-ui-textTertiary">
                <span className="i-ph:magnifying-glass text-2xl mb-2 block mx-auto opacity-50" />
                No results found
              </div>
            ) : (
              <>
                {/* Command Groups */}
                {Object.entries(commandGroups).map(([group, cmds]) => (
                  <div key={group}>
                    <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ui-textTertiary">
                      {group}
                    </div>
                    {cmds.map((cmd) => {
                      itemIndex++;

                      const idx = itemIndex;

                      return (
                        <button
                          key={cmd.id}
                          data-selected={selectedIndex === idx}
                          className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors cursor-pointer ${
                            selectedIndex === idx
                              ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300'
                              : 'text-ui-textSecondary hover:bg-ui-item-backgroundActive'
                          }`}
                          onClick={() => executeItem(idx)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          role="option"
                          aria-selected={selectedIndex === idx}
                        >
                          <span className={`${cmd.icon} text-lg flex-shrink-0`} />
                          <span className="flex-1 truncate">{cmd.label}</span>
                          {cmd.shortcut && (
                            <kbd className="text-[10px] font-medium text-ui-textTertiary bg-ui-background-depth-3 px-1.5 py-0.5 rounded border border-ui-borderColor">
                              {cmd.shortcut}
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}

                {/* Chat Results */}
                {filteredChats.length > 0 && (
                  <div>
                    <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ui-textTertiary mt-1">
                      Recent Chats
                    </div>
                    {filteredChats.map((chat) => {
                      itemIndex++;

                      const idx = itemIndex;

                      return (
                        <button
                          key={chat.id}
                          data-selected={selectedIndex === idx}
                          className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors cursor-pointer ${
                            selectedIndex === idx
                              ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300'
                              : 'text-ui-textSecondary hover:bg-ui-item-backgroundActive'
                          }`}
                          onClick={() => executeItem(idx)}
                          onMouseEnter={() => setSelectedIndex(idx)}
                          role="option"
                          aria-selected={selectedIndex === idx}
                        >
                          <span className="i-ph:chat-circle-dots text-lg flex-shrink-0" />
                          <span className="flex-1 truncate">{chat.description}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2 border-t border-ui-borderColor text-[10px] text-ui-textTertiary">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-ui-background-depth-3 border border-ui-borderColor font-medium">
                ↑↓
              </kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-ui-background-depth-3 border border-ui-borderColor font-medium">
                ↵
              </kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-ui-background-depth-3 border border-ui-borderColor font-medium">
                esc
              </kbd>
              close
            </span>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
