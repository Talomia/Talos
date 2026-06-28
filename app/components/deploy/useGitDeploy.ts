import { toast } from 'react-toastify';
import { createScopedLogger } from '~/utils/logger';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { runtime } from '~/lib/webcontainer';
import { path } from '~/utils/path';
import { useState } from 'react';
import type { ActionCallbackData } from '~/lib/runtime/message-parser';
import { chatId } from '~/lib/persistence/useChatHistory';
import { getLocalStorage } from '~/lib/persistence/localStorage';
import { formatBuildFailureOutput } from './deployUtils';
import { isBinaryFile } from '~/utils/deployUtils';
import type { FileContent } from '~/utils/deployUtils';

type GitProvider = 'github' | 'gitlab';

const PROVIDER_CONFIG: Record<GitProvider, { label: string; connectionKey: string }> = {
  github: { label: 'GitHub', connectionKey: 'github_connection' },
  gitlab: { label: 'GitLab', connectionKey: 'gitlab_connection' },
};

const logger = createScopedLogger('GitDeploy');

/**
 * Unified deploy hook for GitHub and GitLab.
 * Both providers use the same build → collect files → prepare flow.
 */
export function useGitDeploy(provider: GitProvider) {
  const [isDeploying, setIsDeploying] = useState(false);
  const currentChatId = useStore(chatId);
  const config = PROVIDER_CONFIG[provider];

  const handleDeploy = async () => {
    const connection = getLocalStorage(config.connectionKey);

    if (!connection?.token || !connection?.user) {
      toast.error(`Please connect your ${config.label} account in Settings > Connections first`);
      return false;
    }

    if (!currentChatId) {
      toast.error('No active chat found');
      return false;
    }

    try {
      setIsDeploying(true);

      const artifact = workbenchStore.firstArtifact;

      if (!artifact) {
        throw new Error('No active project found');
      }

      // Create a deployment artifact for visual feedback
      const deploymentId = `deploy-${provider}-project`;
      workbenchStore.addArtifact({
        id: deploymentId,
        messageId: deploymentId,
        title: `${config.label} Deployment`,
        type: 'standalone',
      });

      const deployArtifact = workbenchStore.artifacts.get()[deploymentId];

      // Notify that build is starting
      deployArtifact.runner.handleDeployAction('building', 'running', { source: provider });

      const actionId = 'build-' + Date.now();
      const actionData: ActionCallbackData = {
        messageId: `${provider} build`,
        artifactId: artifact.id,
        actionId,
        action: {
          type: 'build' as const,
          content: 'npm run build',
        },
      };

      // Add the action first
      artifact.runner.addAction(actionData);

      // Then run it
      await artifact.runner.runAction(actionData);

      const buildOutput = artifact.runner.buildOutput;

      if (!buildOutput || buildOutput.exitCode !== 0) {
        // Notify that build failed
        deployArtifact.runner.handleDeployAction('building', 'failed', {
          error: formatBuildFailureOutput(buildOutput?.output),
          source: provider,
        });
        throw new Error('Build failed');
      }

      // Notify that build succeeded and deployment preparation is starting
      deployArtifact.runner.handleDeployAction('deploying', 'running', {
        source: provider,
      });

      // Get all project files instead of just the build directory since we're deploying to a repository
      const container = await runtime;

      // Get all files recursively - we'll deploy the entire project, not just the build directory
      async function getAllFiles(dirPath: string, basePath: string = ''): Promise<Record<string, FileContent>> {
        const files: Record<string, FileContent> = {};
        const entries = await container.fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);

          // Create a relative path without the leading slash
          const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

          // Skip node_modules, .git directories and other common excludes
          if (
            entry.isDirectory() &&
            (entry.name === 'node_modules' ||
              entry.name === '.git' ||
              entry.name === 'dist' ||
              entry.name === 'build' ||
              entry.name === '.cache' ||
              entry.name === '.next')
          ) {
            continue;
          }

          if (entry.isFile()) {
            // Skip system files, logs, and env files
            if (entry.name.endsWith('.DS_Store') || entry.name.endsWith('.log') || entry.name.startsWith('.env')) {
              continue;
            }

            try {
              const binary = isBinaryFile(entry.name);
              const content = binary
                ? btoa(
                    Array.from(new Uint8Array((await container.fs.readFile(fullPath)) as Uint8Array))
                      .map((b) => String.fromCharCode(b))
                      .join(''),
                  )
                : await container.fs.readFile(fullPath, 'utf-8');

              // Store the file with its relative path, not the full system path
              files[relativePath] = { content, isBinary: binary };
            } catch (error) {
              logger.warn(`Could not read file ${fullPath}:`, error);
              continue;
            }
          } else if (entry.isDirectory()) {
            const subFiles = await getAllFiles(fullPath, relativePath);
            Object.assign(files, subFiles);
          }
        }

        return files;
      }

      const fileContents = await getAllFiles('/');

      // Deployment preparation is complete — waiting for user to configure repository
      deployArtifact.runner.handleDeployAction('deploying', 'pending', {
        source: provider,
      });

      toast.info(`📦 Files collected. Configure your repository to continue.`);

      return {
        success: true,
        files: fileContents,
        projectName: artifact.title || 'project',
      };
    } catch (err) {
      logger.error(`${config.label} deploy error:`, err);
      toast.error(err instanceof Error ? err.message : `${config.label} deployment preparation failed`);

      return false;
    } finally {
      setIsDeploying(false);
    }
  };

  return {
    isDeploying,
    handleDeploy,
    isConnected: !!getLocalStorage(config.connectionKey)?.user,
  };
}
