import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';

/**
 * Quick file opener (⌘P / Ctrl+P).
 * Fuzzy-searches all files in the workbench and navigates to the selected file.
 */
export function QuickFileOpen() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const files = useStore(workbenchStore.files);

  // Extract file paths from the workbench file store
  const filePaths = useMemo(() => {
    const paths: string[] = [];

    for (const [path, dirent] of Object.entries(files)) {
      if (dirent?.type === 'file') {
        // Strip /home/project/ prefix for display
        const displayPath = path.replace(/^\/home\/project\//, '');
        paths.push(displayPath);
      }
    }

    return paths.sort();
  }, [files]);

  // Fuzzy filter
  const filteredFiles = useMemo(() => {
    if (!query) {
      return filePaths.slice(0, 50);
    }

    const lowerQuery = query.toLowerCase();

    return filePaths
      .filter((path) => {
        const lowerPath = path.toLowerCase();

        // Simple fuzzy: all query chars must appear in order
        let qi = 0;

        for (let pi = 0; pi < lowerPath.length && qi < lowerQuery.length; pi++) {
          if (lowerPath[pi] === lowerQuery[qi]) {
            qi++;
          }
        }

        return qi === lowerQuery.length;
      })
      .slice(0, 50);
  }, [filePaths, query]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredFiles.length]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;

    if (!list) {
      return;
    }

    const item = list.children[selectedIndex] as HTMLElement;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Global ⌘P / Ctrl+P shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'p' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const selectFile = useCallback((path: string) => {
    workbenchStore.setSelectedFile(`/home/project/${path}`);

    if (workbenchStore.currentView.get() !== 'code') {
      workbenchStore.currentView.set('code');
    }

    if (!workbenchStore.showWorkbench.get()) {
      workbenchStore.showWorkbench.set(true);
    }

    setOpen(false);
    setQuery('');
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredFiles.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filteredFiles[selectedIndex]) {
        e.preventDefault();
        selectFile(filteredFiles[selectedIndex]);
      }
    },
    [filteredFiles, selectedIndex, selectFile],
  );

  // Get file icon based on extension
  function getFileIcon(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();

    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'i-ph:file-ts';
      case 'js':
      case 'jsx':
        return 'i-ph:file-js';
      case 'css':
      case 'scss':
        return 'i-ph:file-css';
      case 'html':
        return 'i-ph:file-html';
      case 'json':
        return 'i-ph:file-code';
      case 'md':
        return 'i-ph:file-text';
      case 'png':
      case 'jpg':
      case 'svg':
        return 'i-ph:file-image';
      default:
        return 'i-ph:file';
    }
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={setOpen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-max bg-black/50 backdrop-blur-sm" />
        <RadixDialog.Content
          className="fixed top-[12vh] left-1/2 -translate-x-1/2 z-max w-full max-w-[520px] bg-ui-background-depth-1 rounded-xl border border-ui-borderColor shadow-2xl overflow-hidden"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <RadixDialog.Title className="sr-only">Quick file open</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">
            Search and open files in the workbench by name.
          </RadixDialog.Description>

          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-ui-borderColor">
            <span className="i-ph:file-magnifying-glass text-ui-textTertiary text-lg shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search files by name..."
              className="flex-1 bg-transparent text-sm text-ui-textPrimary placeholder-ui-textTertiary outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="text-[10px] font-mono text-ui-textTertiary px-1.5 py-0.5 rounded bg-ui-background-depth-3 border border-ui-borderColor">
              ⌘P
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[40vh] overflow-y-auto py-1" role="listbox">
            {filteredFiles.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-ui-textTertiary">
                {filePaths.length === 0 ? 'No files in workbench' : 'No matching files'}
              </div>
            ) : (
              filteredFiles.map((path, index) => {
                const fileName = path.split('/').pop() || path;
                const dirPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

                return (
                  <button
                    key={path}
                    role="option"
                    aria-selected={index === selectedIndex}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors ${
                      index === selectedIndex
                        ? 'bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300'
                        : 'text-ui-textPrimary hover:bg-ui-background-depth-2'
                    }`}
                    onClick={() => selectFile(path)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <span className={`${getFileIcon(path)} text-base shrink-0 opacity-60`} />
                    <span className="truncate font-medium">{fileName}</span>
                    {dirPath && <span className="truncate text-xs text-ui-textTertiary ml-auto">{dirPath}</span>}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2 border-t border-ui-borderColor text-[11px] text-ui-textTertiary">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-ui-background-depth-3 border border-ui-borderColor font-mono">
                ↑↓
              </kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-ui-background-depth-3 border border-ui-borderColor font-mono">
                ↵
              </kbd>
              open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-ui-background-depth-3 border border-ui-borderColor font-mono">
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
