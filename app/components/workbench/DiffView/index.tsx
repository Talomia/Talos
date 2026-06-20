import { memo, useEffect } from 'react';
import { createScopedLogger } from '~/utils/logger';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import type { FileMap } from '~/lib/stores/files';
import type { EditorDocument } from '~/components/editor/codemirror/CodeMirrorEditor';
import { diffLines } from 'diff';
import '~/styles/diff-view.css';
import { diffFiles, extractRelativePath } from '~/utils/diff';
import type { FileHistory } from '~/types/actions';
import { getLanguageFromExtension } from '~/utils/getLanguageFromExtension';
import { InlineDiffComparison } from './InlineDiffComparison';

const logger = createScopedLogger('DiffView');

interface DiffViewProps {
  fileHistory: Record<string, FileHistory>;
  setFileHistory: React.Dispatch<React.SetStateAction<Record<string, FileHistory>>>;
}

export const DiffView = memo(({ fileHistory, setFileHistory }: DiffViewProps) => {
  const files = useStore(workbenchStore.files) as FileMap;
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument) as EditorDocument;
  const unsavedFiles = useStore(workbenchStore.unsavedFiles);

  useEffect(() => {
    if (selectedFile && currentDocument) {
      const file = files[selectedFile];

      if (!file || !('content' in file)) {
        return;
      }

      const existingHistory = fileHistory[selectedFile];
      const currentContent = currentDocument.value;

      // Normalizar o conteúdo para comparação
      const normalizedCurrentContent = currentContent.replace(/\r\n/g, '\n').trim();
      const normalizedOriginalContent = (existingHistory?.originalContent || file.content)
        .replace(/\r\n/g, '\n')
        .trim();

      // Se não há histórico existente, criar um novo apenas se houver diferenças
      if (!existingHistory) {
        if (normalizedCurrentContent !== normalizedOriginalContent) {
          const newChanges = diffLines(file.content, currentContent);
          setFileHistory((prev) => ({
            ...prev,
            [selectedFile]: {
              originalContent: file.content,
              lastModified: Date.now(),
              changes: newChanges,
              versions: [
                {
                  timestamp: Date.now(),
                  content: currentContent,
                },
              ],
              changeSource: 'auto-save',
            },
          }));
        }

        return;
      }

      // Se já existe histórico, verificar se há mudanças reais desde a última versão
      const lastVersion = existingHistory.versions[existingHistory.versions.length - 1];
      const normalizedLastContent = lastVersion?.content.replace(/\r\n/g, '\n').trim();

      if (normalizedCurrentContent === normalizedLastContent) {
        return; // Não criar novo histórico se o conteúdo é o mesmo
      }

      // Verificar se há mudanças significativas usando diffFiles
      const relativePath = extractRelativePath(selectedFile);
      const unifiedDiff = diffFiles(relativePath, existingHistory.originalContent, currentContent);

      if (unifiedDiff) {
        const newChanges = diffLines(existingHistory.originalContent, currentContent);

        // Verificar se as mudanças são significativas
        const hasSignificantChanges = newChanges.some(
          (change) => (change.added || change.removed) && change.value.trim().length > 0,
        );

        if (hasSignificantChanges) {
          const newHistory: FileHistory = {
            originalContent: existingHistory.originalContent,
            lastModified: Date.now(),
            changes: [...existingHistory.changes, ...newChanges].slice(-100), // Limitar histórico de mudanças
            versions: [
              ...existingHistory.versions,
              {
                timestamp: Date.now(),
                content: currentContent,
              },
            ].slice(-10), // Manter apenas as 10 últimas versões
            changeSource: 'auto-save',
          };

          setFileHistory((prev) => ({ ...prev, [selectedFile]: newHistory }));
        }
      }
    }
  }, [selectedFile, currentDocument?.value, files, setFileHistory, unsavedFiles]);

  if (!selectedFile || !currentDocument) {
    return (
      <div className="flex w-full h-full justify-center items-center bg-ui-background-depth-1 text-ui-textPrimary">
        Select a file to view differences
      </div>
    );
  }

  const file = files[selectedFile];
  const originalContent = file && 'content' in file ? file.content : '';
  const currentContent = currentDocument.value;

  const history = fileHistory[selectedFile];
  const effectiveOriginalContent = history?.originalContent || originalContent;
  const language = getLanguageFromExtension(selectedFile.split('.').pop() || '');

  try {
    return (
      <div className="h-full overflow-hidden">
        <InlineDiffComparison
          beforeCode={effectiveOriginalContent}
          afterCode={currentContent}
          language={language}
          filename={selectedFile}
          lightTheme="github-light"
          darkTheme="github-dark"
        />
      </div>
    );
  } catch (error) {
    logger.error('DiffView render error:', error);
    return (
      <div className="flex w-full h-full justify-center items-center bg-ui-background-depth-1 text-red-400">
        <div className="text-center">
          <div className="i-ph:warning-circle text-4xl mb-2" />
          <p>Failed to render diff view</p>
        </div>
      </div>
    );
  }
});
