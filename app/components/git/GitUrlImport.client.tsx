import { useSearchParams, useNavigate } from '@remix-run/react';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('GitUrlImport');
import { generateId, type Message } from 'ai';
import ignore from 'ignore';
import { useEffect, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { useGit } from '~/lib/hooks/useGit';
import { useChatHistory } from '~/lib/persistence';
import { createCommandsMessage, detectProjectCommands, escapeXmlTags } from '~/utils/projectCommands';
import { ARTIFACT_TAG_OPEN, ARTIFACT_TAG_CLOSE, ACTION_TAG_OPEN, ACTION_TAG_CLOSE } from '~/lib/app-config';
import { LoadingOverlay } from '~/components/ui/LoadingOverlay';
import { toast } from 'react-toastify';

const IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  '.github/**',
  '.vscode/**',
  '**/*.jpg',
  '**/*.jpeg',
  '**/*.png',
  'dist/**',
  'build/**',
  '.next/**',
  'coverage/**',
  '.cache/**',
  '.vscode/**',
  '.idea/**',
  '**/*.log',
  '**/.DS_Store',
  '**/npm-debug.log*',
  '**/yarn-debug.log*',
  '**/yarn-error.log*',

  // Include this so npm install runs much faster '**/*lock.json',
  '**/*lock.yaml',
];

/**
 * Validates a git URL to prevent dangerous protocols and ensure it's a valid remote URL.
 * Allows: https://, http://, ssh://, git://, and git@host:user/repo shorthand.
 * Rejects: file://, javascript:, data:, and other potentially dangerous protocols.
 */
function isValidGitUrl(url: string): boolean {
  const trimmed = url.trim();

  // Reject empty strings
  if (!trimmed) {
    return false;
  }

  // Reject dangerous protocols
  const dangerousProtocols = ['file:', 'javascript:', 'data:', 'vbscript:'];

  if (dangerousProtocols.some((proto) => trimmed.toLowerCase().startsWith(proto))) {
    return false;
  }

  // Allow git@host:user/repo.git SSH shorthand
  if (/^git@[\w.-]+:[\w./-]+$/.test(trimmed)) {
    return true;
  }

  // Allow https://, http://, ssh://, git:// URLs
  try {
    const parsed = new URL(trimmed);
    return ['https:', 'http:', 'ssh:', 'git:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function GitUrlImport() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { ready: historyReady, importChat } = useChatHistory();
  const { ready: gitReady, gitClone } = useGit();
  const [imported, setImported] = useState(false);
  const [loading, setLoading] = useState(true);

  const importRepo = async (repoUrl?: string) => {
    if (!gitReady && !historyReady) {
      return;
    }

    if (repoUrl) {
      // Validate the git URL before cloning
      if (!isValidGitUrl(repoUrl)) {
        toast.error('Invalid repository URL. Please provide a valid GitHub, GitLab, or Bitbucket URL.');
        setLoading(false);
        navigate('/');

        return;
      }

      const ig = ignore().add(IGNORE_PATTERNS);

      try {
        const { workdir, data } = await gitClone(repoUrl);

        if (importChat) {
          const filePaths = Object.keys(data).filter((filePath) => !ig.ignores(filePath));
          const textDecoder = new TextDecoder('utf-8');

          const fileContents = filePaths
            .map((filePath) => {
              const { data: content, encoding } = data[filePath];
              return {
                path: filePath,
                content:
                  encoding === 'utf8' ? content : content instanceof Uint8Array ? textDecoder.decode(content) : '',
              };
            })
            .filter((f) => f.content);

          const commands = await detectProjectCommands(fileContents);
          const commandsMessage = createCommandsMessage(commands);

          const filesMessage: Message = {
            role: 'assistant',
            content: `Cloning the repo ${repoUrl} into ${workdir}
${ARTIFACT_TAG_OPEN} id="imported-files" title="Git Cloned Files"  type="bundled">
${fileContents
  .map(
    (file) =>
      `${ACTION_TAG_OPEN} type="file" filePath="${file.path}">
${escapeXmlTags(file.content)}
${ACTION_TAG_CLOSE}`,
  )
  .join('\n')}
${ARTIFACT_TAG_CLOSE}`,
            id: generateId(),
            createdAt: new Date(),
          };

          const messages = [filesMessage];

          if (commandsMessage) {
            messages.push({
              role: 'user',
              id: generateId(),
              content: 'Setup the codebase and Start the application',
            });
            messages.push(commandsMessage);
          }

          await importChat(`Git Project:${repoUrl.split('/').slice(-1)[0]}`, messages, { gitUrl: repoUrl });
        }
      } catch (error) {
        logger.error('Error during import:', error);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('Authentication')) {
          toast.error('Authentication failed. For private repos, check your access token.');
        } else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
          toast.error('Repository not found. Check the URL and try again.');
        } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
          toast.error('Network error. Check your connection and try again.');
        } else {
          toast.error(`Failed to import repository: ${errorMessage}`);
        }

        setLoading(false);
        navigate('/');

        return;
      }
    }
  };

  useEffect(() => {
    if (!historyReady || !gitReady || imported) {
      return;
    }

    const url = searchParams.get('url');

    if (!url) {
      navigate('/');
      return;
    }

    importRepo(url).catch((error) => {
      logger.error('Error importing repo:', error);
      toast.error('Failed to import repository');
      setLoading(false);
      navigate('/');
    });
    setImported(true);
  }, [searchParams, historyReady, gitReady, imported]);

  return (
    <ClientOnly fallback={<BaseChat />}>
      {() => (
        <>
          <Chat />
          {loading && <LoadingOverlay message="Please wait while we clone the repository..." />}
        </>
      )}
    </ClientOnly>
  );
}
