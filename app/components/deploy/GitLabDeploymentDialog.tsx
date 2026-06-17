import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('GitLabDeploymentDialog');
import { toast } from 'react-toastify';
import { getLocalStorage } from '~/lib/persistence/localStorage';
import type { GitLabUserResponse, GitLabProjectInfo } from '~/types/GitLab';
import { logStore } from '~/lib/stores/logs';
import { chatId } from '~/lib/persistence/useChatHistory';
import { useStore } from '@nanostores/react';
import { GitLabApiService } from '~/lib/services/gitlabApiService';
import { Badge } from '~/components/ui';
import { formatSize } from '~/utils/formatSize';
import { GitLabAuthDialog } from '~/components/@settings/tabs/gitlab/components/GitLabAuthDialog';
import { classifyDeploymentError } from '~/components/deploy/deployUtils';
import {
  DeploymentSuccessDialog,
  ConnectionRequiredDialog,
  type DeploymentProviderConfig,
} from '~/components/deploy/DeploymentDialogComponents';
import { useDeploymentDialog } from '~/components/deploy/useDeploymentDialog';
import { RepoListSection } from '~/components/deploy/RepoListSection';
import { DeploymentFormShell } from '~/components/deploy/DeploymentFormShell';

const GITLAB_PROVIDER: DeploymentProviderConfig = {
  name: 'GitLab',
  logoIcon: 'i-ph:gitlab-logo',
  brandColor: 'orange',
};

interface GitLabDeploymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  files: Record<string, string>;
}

/**
 * Fetches GitLab projects using the API service.
 */
async function fetchGitLabRepos(token: string, connection: Record<string, unknown>): Promise<GitLabProjectInfo[]> {
  try {
    const gitlabUrl = (typeof connection.gitlabUrl === 'string' ? connection.gitlabUrl : null) || 'https://gitlab.com';
    const apiService = new GitLabApiService(token, gitlabUrl);

    return await apiService.getProjects();
  } catch (error) {
    logger.error('Failed to fetch GitLab repositories:', error);
    logStore.logError('Failed to fetch GitLab repositories', { error });
    toast.error('Failed to fetch recent repositories');

    return [];
  }
}

export function GitLabDeploymentDialog({ isOpen, onClose, projectName, files }: GitLabDeploymentDialogProps) {
  const currentChatId = useStore(chatId);

  const dialog = useDeploymentDialog<GitLabUserResponse, GitLabProjectInfo>({
    isOpen,
    projectName,
    storageKey: 'gitlab_connection',
    getUser: (conn) => (conn.user as GitLabUserResponse) ?? null,
    getToken: (conn) => (typeof conn.token === 'string' ? conn.token : null),
    fetchRepos: fetchGitLabRepos,
    onClose,
    sanitizeName: (name) => name.replace(/\s+/g, '-').toLowerCase(),
  });

  // Function to create a new repository or push to an existing one
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const connection = getLocalStorage('gitlab_connection');

    if (!connection?.token || !connection?.user) {
      toast.error('Please connect your GitLab account in Settings > Connections first');
      return;
    }

    if (!dialog.repoName.trim()) {
      toast.error('Repository name is required');
      return;
    }

    dialog.setIsLoading(true);

    // Sanitize repository name to match what the API will create
    const sanitizedRepoName = dialog.repoName
      .replace(/[^a-zA-Z0-9-_.]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();

    try {
      const gitlabUrl = connection.gitlabUrl || 'https://gitlab.com';
      const apiService = new GitLabApiService(connection.token, gitlabUrl);

      // Warn user if repository name was changed
      if (sanitizedRepoName !== dialog.repoName && sanitizedRepoName !== dialog.repoName.toLowerCase()) {
        toast.info(`Repository name sanitized to "${sanitizedRepoName}" to meet GitLab requirements`);
      }

      // Check if project exists using the sanitized name
      const projectPath = `${connection.user.username}/${sanitizedRepoName}`;
      const existingProject = await apiService.getProjectByPath(projectPath);
      const projectExists = existingProject !== null;

      if (projectExists && existingProject) {
        // Confirm overwrite
        const visibilityChange =
          existingProject.visibility !== (dialog.isPrivate ? 'private' : 'public')
            ? `\n\nThis will also change the repository from ${existingProject.visibility} to ${dialog.isPrivate ? 'private' : 'public'}.`
            : '';

        const confirmOverwrite = window.confirm(
          `Repository "${sanitizedRepoName}" already exists. Do you want to update it? This will add or modify files in the repository.${visibilityChange}`,
        );

        if (!confirmOverwrite) {
          dialog.setIsLoading(false);
          return;
        }

        // Update visibility if needed
        if (existingProject.visibility !== (dialog.isPrivate ? 'private' : 'public')) {
          toast.info('Updating repository visibility...');
          await apiService.updateProjectVisibility(existingProject.id, dialog.isPrivate ? 'private' : 'public');
        }

        // Update project with files
        toast.info('Uploading files to existing repository...');
        await apiService.updateProjectWithFiles(existingProject.id, files);
        dialog.setCreatedRepoUrl(existingProject.http_url_to_repo);
        toast.success('Repository updated successfully!');
      } else {
        // Create new project with files
        toast.info('Creating new repository...');

        const newProject = await apiService.createProjectWithFiles(sanitizedRepoName, dialog.isPrivate, files);
        dialog.setCreatedRepoUrl(newProject.http_url_to_repo);
        toast.success('Repository created successfully!');
      }

      // Set pushed files for display
      const fileList = Object.entries(files).map(([filePath, content]) => ({
        path: filePath,
        size: new TextEncoder().encode(content).length,
      }));

      dialog.setPushedFiles(fileList);
      dialog.setShowSuccessDialog(true);

      // Save repository info
      localStorage.setItem(
        `gitlab-repo-${currentChatId}`,
        JSON.stringify({
          owner: connection.user.username,
          name: sanitizedRepoName,
          url: dialog.createdRepoUrl,
        }),
      );

      logStore.logInfo('GitLab deployment completed successfully', {
        type: 'system',
        message: `Successfully deployed ${fileList.length} files to ${projectExists ? 'existing' : 'new'} GitLab repository: ${projectPath}`,
        repoName: sanitizedRepoName,
        projectPath,
        filesCount: fileList.length,
        isNewProject: !projectExists,
      });
    } catch (error) {
      logger.error('Error pushing to GitLab:', error);

      logStore.logError('GitLab deployment failed', {
        error,
        repoName: sanitizedRepoName,
        projectPath: `${connection.user.username}/${sanitizedRepoName}`,
      });

      const classified = classifyDeploymentError(error);
      toast.error(classified.message);
    } finally {
      dialog.setIsLoading(false);
    }
  };

  // Success Dialog
  if (dialog.showSuccessDialog) {
    return (
      <DeploymentSuccessDialog
        isOpen={isOpen}
        onClose={dialog.handleClose}
        provider={GITLAB_PROVIDER}
        repoUrl={dialog.createdRepoUrl}
        pushedFiles={dialog.pushedFiles}
        formatSize={formatSize}
      />
    );
  }

  if (!dialog.user) {
    return (
      <ConnectionRequiredDialog
        isOpen={isOpen}
        onClose={dialog.handleClose}
        provider={GITLAB_PROVIDER}
        onConnect={() => dialog.setShowAuthDialog(true)}
      >
        <GitLabAuthDialog isOpen={dialog.showAuthDialog} onClose={dialog.handleAuthDialogClose} />
      </ConnectionRequiredDialog>
    );
  }

  const renderGitLabAvatar = () => (
    <>
      {dialog.user!.avatar_url && dialog.user!.avatar_url !== 'null' && dialog.user!.avatar_url !== '' ? (
        <img
          src={dialog.user!.avatar_url}
          alt={dialog.user!.username}
          className="w-10 h-10 rounded-full object-cover"
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
          onError={(e) => {
            // Handle CORS/COEP errors by hiding the image and showing fallback
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';

            const fallback = target.parentElement?.querySelector('.avatar-fallback') as HTMLElement;

            if (fallback) {
              fallback.style.display = 'flex';
            }
          }}
          onLoad={(e) => {
            // Ensure fallback is hidden when image loads successfully
            const target = e.target as HTMLImageElement;

            const fallback = target.parentElement?.querySelector('.avatar-fallback') as HTMLElement;

            if (fallback) {
              fallback.style.display = 'none';
            }
          }}
        />
      ) : null}

      <div
        className="avatar-fallback w-10 h-10 rounded-full bg-bolt-elements-background-depth-4 flex items-center justify-center text-bolt-elements-textSecondary font-semibold text-sm"
        style={{
          display:
            dialog.user!.avatar_url && dialog.user!.avatar_url !== 'null' && dialog.user!.avatar_url !== ''
              ? 'none'
              : 'flex',
        }}
      >
        {dialog.user!.name ? (
          dialog.user!.name.charAt(0).toUpperCase()
        ) : dialog.user!.username ? (
          dialog.user!.username.charAt(0).toUpperCase()
        ) : (
          <div className="i-ph:user w-5 h-5" />
        )}
      </div>
    </>
  );

  return (
    <>
      <DeploymentFormShell
        isOpen={isOpen}
        onClose={dialog.handleClose}
        brandColor="orange"
        providerIcon="i-ph:gitlab-logo"
        providerName="GitLab"
        avatarUrl={dialog.user.avatar_url}
        displayName={dialog.user.name || dialog.user.username}
        username={dialog.user.username}
        renderAvatar={renderGitLabAvatar}
        repoName={dialog.repoName}
        onRepoNameChange={dialog.setRepoName}
        isPrivate={dialog.isPrivate}
        onPrivateChange={dialog.setIsPrivate}
        isLoading={dialog.isLoading}
        onSubmit={handleSubmit}
      >
        <RepoListSection<GitLabProjectInfo>
          recentRepos={dialog.recentRepos}
          filteredRepos={dialog.filteredRepos}
          repoSearchQuery={dialog.repoSearchQuery}
          isFetchingRepos={dialog.isFetchingRepos}
          brandColor="orange"
          providerIcon="i-ph:gitlab-logo"
          onSearchChange={dialog.setRepoSearchQuery}
          onSearchClear={() => dialog.setRepoSearchQuery('')}
          onSelectRepo={dialog.setRepoName}
          getRepoKey={(repo) => String(repo.id)}
          isPrivate={(repo) => repo.visibility === 'private'}
          renderBadges={(repo) => (
            <>
              <Badge variant="subtle" size="sm" icon="i-ph:star w-3 h-3">
                {repo.star_count.toLocaleString()}
              </Badge>
              <Badge variant="subtle" size="sm" icon="i-ph:git-fork w-3 h-3">
                {repo.forks_count.toLocaleString()}
              </Badge>
              <Badge variant="subtle" size="sm" icon="i-ph:clock w-3 h-3">
                {new Date(repo.updated_at).toLocaleDateString()}
              </Badge>
            </>
          )}
        />
      </DeploymentFormShell>

      {/* GitLab Auth Dialog */}
      <GitLabAuthDialog isOpen={dialog.showAuthDialog} onClose={dialog.handleAuthDialogClose} />
    </>
  );
}
