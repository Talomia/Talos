import { memo, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';

const LANGUAGE_MAP: Record<string, { label: string; icon: string }> = {
  ts: { label: 'TypeScript', icon: 'i-ph:file-ts' },
  tsx: { label: 'TypeScript JSX', icon: 'i-ph:file-ts' },
  js: { label: 'JavaScript', icon: 'i-ph:file-js' },
  jsx: { label: 'JavaScript JSX', icon: 'i-ph:file-js' },
  css: { label: 'CSS', icon: 'i-ph:file-css' },
  scss: { label: 'SCSS', icon: 'i-ph:file-css' },
  html: { label: 'HTML', icon: 'i-ph:file-html' },
  json: { label: 'JSON', icon: 'i-ph:file-code' },
  md: { label: 'Markdown', icon: 'i-ph:file-text' },
  svg: { label: 'SVG', icon: 'i-ph:file-image' },
  png: { label: 'PNG', icon: 'i-ph:file-image' },
  jpg: { label: 'JPEG', icon: 'i-ph:file-image' },
  yaml: { label: 'YAML', icon: 'i-ph:file-code' },
  yml: { label: 'YAML', icon: 'i-ph:file-code' },
  toml: { label: 'TOML', icon: 'i-ph:file-code' },
  sh: { label: 'Shell', icon: 'i-ph:terminal' },
  py: { label: 'Python', icon: 'i-ph:file-code' },
  rs: { label: 'Rust', icon: 'i-ph:file-code' },
  go: { label: 'Go', icon: 'i-ph:file-code' },
};

function getLanguageInfo(filePath: string): { label: string; icon: string } {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return LANGUAGE_MAP[ext] || { label: ext.toUpperCase() || 'Plain Text', icon: 'i-ph:file' };
}

function formatFileSize(content: string): string {
  const bytes = new Blob([content]).size;

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const EditorStatusBar = memo(() => {
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument);
  const currentView = useStore(workbenchStore.currentView);

  const fileInfo = useMemo(() => {
    if (!selectedFile || !currentDocument) {
      return null;
    }

    const content = currentDocument.value || '';
    const lineCount = content.split('\n').length;
    const lang = getLanguageInfo(selectedFile);
    const size = formatFileSize(content);
    const displayPath = selectedFile.replace(/^\/home\/project\//, '');

    return { lineCount, lang, size, displayPath };
  }, [selectedFile, currentDocument]);

  if (!fileInfo || currentView !== 'code') {
    return null;
  }

  return (
    <div className="flex items-center justify-between px-3 py-1 text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/80 border-t border-gray-200 dark:border-gray-800 select-none shrink-0">
      {/* Left: file path */}
      <div className="flex items-center gap-3 truncate">
        <span className="flex items-center gap-1.5 truncate">
          <span className={`${fileInfo.lang.icon} text-xs opacity-60`} />
          <span className="truncate opacity-80">{fileInfo.displayPath}</span>
        </span>
      </div>

      {/* Right: metadata */}
      <div className="flex items-center gap-3 shrink-0">
        <span>{fileInfo.lang.label}</span>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span>
          {fileInfo.lineCount} {fileInfo.lineCount === 1 ? 'line' : 'lines'}
        </span>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span>{fileInfo.size}</span>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span>UTF-8</span>
      </div>
    </div>
  );
});
