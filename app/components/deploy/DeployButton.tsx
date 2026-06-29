import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useStore } from '@nanostores/react';
import { netlifyConnection } from '~/lib/stores/netlify';
import { vercelConnection } from '~/lib/stores/vercel';
import { isGitLabConnected } from '~/lib/stores/gitlabConnection';
import { workbenchStore } from '~/lib/stores/workbench';
import { streamingState } from '~/lib/stores/streaming';
import { classNames } from '~/utils/classNames';
import { ErrorBoundary } from '~/components/ui/ErrorBoundary';
import { useState, useCallback, lazy, Suspense } from 'react';
import { NetlifyDeploymentLink } from '~/components/chat/NetlifyDeploymentLink.client';
import { VercelDeploymentLink } from '~/components/chat/VercelDeploymentLink.client';
import { useVercelDeploy } from '~/components/deploy/VercelDeploy.client';
import { useNetlifyDeploy } from '~/components/deploy/NetlifyDeploy.client';
import { useGitHubDeploy } from '~/components/deploy/GitHubDeploy.client';
import { useGitLabDeploy } from '~/components/deploy/GitLabDeploy.client';
import { ServiceIcon } from '~/components/ui/ServiceIcon';

const GitHubDeploymentDialog = lazy(() =>
  import('~/components/deploy/GitHubDeploymentDialog').then((m) => ({ default: m.GitHubDeploymentDialog })),
);
const GitLabDeploymentDialog = lazy(() =>
  import('~/components/deploy/GitLabDeploymentDialog').then((m) => ({ default: m.GitLabDeploymentDialog })),
);
import type { FileContent } from '~/utils/deployUtils';

type DeployTarget = 'netlify' | 'vercel' | 'github' | 'gitlab';

interface DeployButtonProps {
  onVercelDeploy?: () => Promise<void>;
  onNetlifyDeploy?: () => Promise<void>;
  onGitHubDeploy?: () => Promise<void>;
  onGitLabDeploy?: () => Promise<void>;
}

/* Shared class for dropdown menu items. */
const ITEM_CLASS =
  'cursor-pointer flex items-center w-full px-4 py-2 text-sm text-ui-textPrimary hover:bg-ui-item-backgroundActive gap-2 rounded-md group relative';
const DISABLED_CLASS = 'opacity-60 cursor-not-allowed';

export const DeployButton = ({
  onVercelDeploy,
  onNetlifyDeploy,
  onGitHubDeploy,
  onGitLabDeploy,
}: DeployButtonProps) => {
  const netlifyConn = useStore(netlifyConnection);
  const vercelConn = useStore(vercelConnection);
  const gitlabIsConnected = useStore(isGitLabConnected);
  const previews = useStore(workbenchStore.previews);
  const activePreview = previews[0];
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployingTo, setDeployingTo] = useState<DeployTarget | null>(null);
  const isStreaming = useStore(streamingState);
  const { handleVercelDeploy } = useVercelDeploy();
  const { handleNetlifyDeploy } = useNetlifyDeploy();
  const { handleGitHubDeploy } = useGitHubDeploy();
  const { handleGitLabDeploy } = useGitLabDeploy();
  const [showGitHubDeploymentDialog, setShowGitHubDeploymentDialog] = useState(false);
  const [showGitLabDeploymentDialog, setShowGitLabDeploymentDialog] = useState(false);
  const [githubDeploymentFiles, setGithubDeploymentFiles] = useState<Record<string, FileContent> | null>(null);
  const [gitlabDeploymentFiles, setGitlabDeploymentFiles] = useState<Record<string, FileContent> | null>(null);
  const [githubProjectName, setGithubProjectName] = useState('');
  const [gitlabProjectName, setGitlabProjectName] = useState('');

  /**
   * Wraps any deploy handler with loading state management.
   * Eliminates the duplicated try/finally pattern across 4 handlers.
   */
  const wrapDeploy = useCallback(
    (target: DeployTarget, handler: () => Promise<void>) => async () => {
      setIsDeploying(true);
      setDeployingTo(target);

      try {
        await handler();
      } finally {
        setIsDeploying(false);
        setDeployingTo(null);
      }
    },
    [],
  );

  const handleVercelDeployClick = wrapDeploy('vercel', async () => {
    if (onVercelDeploy) {
      await onVercelDeploy();
    } else {
      await handleVercelDeploy();
    }
  });

  const handleNetlifyDeployClick = wrapDeploy('netlify', async () => {
    if (onNetlifyDeploy) {
      await onNetlifyDeploy();
    } else {
      await handleNetlifyDeploy();
    }
  });

  const handleGitHubDeployClick = wrapDeploy('github', async () => {
    if (onGitHubDeploy) {
      await onGitHubDeploy();
    } else {
      const result = await handleGitHubDeploy();

      if (result && result.success && result.files) {
        setGithubDeploymentFiles(result.files);
        setGithubProjectName(result.projectName);
        setShowGitHubDeploymentDialog(true);
      }
    }
  });

  const handleGitLabDeployClick = wrapDeploy('gitlab', async () => {
    if (onGitLabDeploy) {
      await onGitLabDeploy();
    } else {
      const result = await handleGitLabDeploy();

      if (result && result.success && result.files) {
        setGitlabDeploymentFiles(result.files);
        setGitlabProjectName(result.projectName);
        setShowGitLabDeploymentDialog(true);
      }
    }
  });

  return (
    <>
      <div className="flex border border-ui-borderColor rounded-md overflow-hidden text-sm">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            disabled={isDeploying || !activePreview || isStreaming}
            className="rounded-md items-center justify-center [&:is(:disabled,.disabled)]:cursor-not-allowed [&:is(:disabled,.disabled)]:opacity-60 px-3 py-1.5 text-xs bg-accent-500 text-white hover:text-ui-item-contentAccent [&:not(:disabled,.disabled)]:hover:bg-ui-button-primary-backgroundHover outline-accent-500 flex gap-1.7"
          >
            {isDeploying ? (
              <>
                <div className="i-svg-spinners:90-ring-with-bg text-lg animate-spin" />
                Deploying to {deployingTo}...
              </>
            ) : (
              <>
                <div className="i-ph:cloud-arrow-up text-lg" />
                Deploy
              </>
            )}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            className={classNames(
              'z-[250] min-w-[280px]',
              'bg-ui-background-depth-1 border border-ui-borderColor rounded-lg shadow-lg',
              'animate-in fade-in-0 zoom-in-95',
              'py-1',
            )}
            sideOffset={5}
            align="end"
          >
            {/* Netlify */}
            <DropdownMenu.Item
              className={classNames(ITEM_CLASS, {
                [DISABLED_CLASS]: isDeploying || !activePreview || !netlifyConn.user,
              })}
              disabled={isDeploying || !activePreview || !netlifyConn.user}
              onClick={handleNetlifyDeployClick}
            >
              <ServiceIcon src="https://cdn.simpleicons.org/netlify" alt="netlify" fallbackIcon="i-ph:globe-simple" />
              <span className="mx-auto">
                {!netlifyConn.user ? 'No Netlify Account Connected' : 'Deploy to Netlify'}
              </span>
              {netlifyConn.user && <NetlifyDeploymentLink />}
            </DropdownMenu.Item>

            {/* Vercel */}
            <DropdownMenu.Item
              className={classNames(ITEM_CLASS, {
                [DISABLED_CLASS]: isDeploying || !activePreview || !vercelConn.user,
              })}
              disabled={isDeploying || !activePreview || !vercelConn.user}
              onClick={handleVercelDeployClick}
            >
              <ServiceIcon
                src="https://cdn.simpleicons.org/vercel/white"
                alt="vercel"
                fallbackIcon="i-ph:triangle"
                className="w-5 h-5 bg-black p-1 rounded"
              />
              <span className="mx-auto">{!vercelConn.user ? 'No Vercel Account Connected' : 'Deploy to Vercel'}</span>
              {vercelConn.user && <VercelDeploymentLink />}
            </DropdownMenu.Item>

            {/* GitHub */}
            <DropdownMenu.Item
              className={classNames(ITEM_CLASS, {
                [DISABLED_CLASS]: isDeploying || !activePreview,
              })}
              disabled={isDeploying || !activePreview}
              onClick={handleGitHubDeployClick}
            >
              <ServiceIcon src="https://cdn.simpleicons.org/github" alt="github" fallbackIcon="i-ph:github-logo" />
              <span className="mx-auto">Deploy to GitHub</span>
            </DropdownMenu.Item>

            {/* GitLab */}
            <DropdownMenu.Item
              className={classNames(ITEM_CLASS, {
                [DISABLED_CLASS]: isDeploying || !activePreview || !gitlabIsConnected,
              })}
              disabled={isDeploying || !activePreview || !gitlabIsConnected}
              onClick={handleGitLabDeployClick}
            >
              <ServiceIcon src="https://cdn.simpleicons.org/gitlab" alt="gitlab" fallbackIcon="i-ph:gitlab-logo" />
              <span className="mx-auto">{!gitlabIsConnected ? 'No GitLab Account Connected' : 'Deploy to GitLab'}</span>
            </DropdownMenu.Item>

            {/* Cloudflare (Coming Soon) */}
            <DropdownMenu.Item
              disabled
              className="flex items-center w-full rounded-md px-4 py-2 text-sm text-ui-textTertiary gap-2 opacity-60 cursor-not-allowed"
            >
              <ServiceIcon src="https://cdn.simpleicons.org/cloudflare" alt="cloudflare" fallbackIcon="i-ph:cloud" />
              <span className="mx-auto">Deploy to Cloudflare (Coming Soon)</span>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      {/* GitHub Deployment Dialog */}
      {showGitHubDeploymentDialog && githubDeploymentFiles && (
        <ErrorBoundary panelName="GitHub deployment">
          <Suspense fallback={null}>
            <GitHubDeploymentDialog
              isOpen={showGitHubDeploymentDialog}
              onClose={() => setShowGitHubDeploymentDialog(false)}
              projectName={githubProjectName}
              files={githubDeploymentFiles}
            />
          </Suspense>
        </ErrorBoundary>
      )}

      {/* GitLab Deployment Dialog */}
      {showGitLabDeploymentDialog && gitlabDeploymentFiles && (
        <ErrorBoundary panelName="GitLab deployment">
          <Suspense fallback={null}>
            <GitLabDeploymentDialog
              isOpen={showGitLabDeploymentDialog}
              onClose={() => setShowGitLabDeploymentDialog(false)}
              projectName={gitlabProjectName}
              files={gitlabDeploymentFiles}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </>
  );
};
