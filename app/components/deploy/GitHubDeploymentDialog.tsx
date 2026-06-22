import { useState, useRef } from 'react';
import { toast } from 'react-toastify';
import { Octokit } from '@octokit/rest';
import { getLocalStorage } from '~/lib/persistence/localStorage';
import type { GitHubUserResponse, GitHubRepoInfo } from '~/types/GitHub';
import { logStore } from '~/lib/stores/logs';
import { chatId } from '~/lib/persistence/useChatHistory';
import { useStore } from '@nanostores/react';
import { GitHubAuthDialog } from '~/components/@settings/tabs/github/components/GitHubAuthDialog';
import { Badge } from '~/components/ui';
import { createScopedLogger } from '~/utils/logger';
import { sanitizeRepoName, classifyDeploymentError } from '~/components/deploy/deployUtils';
import {
  DeploymentSuccessDialog,
  ConnectionRequiredDialog,
  type DeploymentProviderConfig,
} from '~/components/deploy/DeploymentDialogComponents';
import { useDeploymentDialog } from '~/components/deploy/useDeploymentDialog';
import { RepoListSection } from '~/components/deploy/RepoListSection';
import { DeploymentFormShell } from '~/components/deploy/DeploymentFormShell';
import type { FileContent } from '~/utils/deployUtils';

const GITHUB_PROVIDER: DeploymentProviderConfig = {
  name: 'GitHub',
  logoIcon: 'i-ph:github-logo',
  brandColor: 'purple',
};

const logger = createScopedLogger('GitHubDeploymentDialog');

interface GitHubDeploymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  files: Record<string, FileContent>;
}

/**
 * Fetches ALL GitHub repos by paginating through all pages.
 */
async function fetchGitHubRepos(token: string): Promise<GitHubRepoInfo[]> {
  let allRepos: GitHubRepoInfo[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const requestUrl = `https://api.github.com/user/repos?sort=updated&per_page=100&page=${page}&affiliation=owner,organization_member`;
    const response = await fetch(requestUrl, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token.trim()}`,
      },
    });

    if (!response.ok) {
      let errorData: { message?: string } = {};

      try {
        errorData = await response.json();
      } catch {
        errorData = { message: 'Could not parse error response' };
      }

      if (response.status === 401) {
        toast.error('GitHub token expired. Please reconnect your account.');
        localStorage.removeItem('github_connection');
      } else if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
        // Rate limit exceeded
        const resetTime = response.headers.get('x-ratelimit-reset');
        const resetDate = resetTime ? new Date(parseInt(resetTime) * 1000).toLocaleTimeString() : 'soon';
        toast.error(`GitHub API rate limit exceeded. Limit resets at ${resetDate}`);
      } else {
        logStore.logError('Failed to fetch GitHub repositories', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        });
        toast.error(`Failed to fetch repositories: ${errorData.message || response.statusText}`);
      }

      return [];
    }

    try {
      const repos = (await response.json()) as GitHubRepoInfo[];
      allRepos = allRepos.concat(repos);

      if (repos.length < 100) {
        hasMore = false;
      } else {
        page += 1;
      }
    } catch (parseError) {
      logStore.logError('Failed to parse GitHub repositories response', { parseError });
      toast.error('Failed to parse repository data');

      return [];
    }
  }

  return allRepos;
}

export function GitHubDeploymentDialog({ isOpen, onClose, projectName, files }: GitHubDeploymentDialogProps) {
  const currentChatId = useStore(chatId);

  const dialog = useDeploymentDialog<GitHubUserResponse, GitHubRepoInfo>({
    isOpen,
    projectName,
    storageKey: 'github_connection',
    getUser: (conn) => (conn.user as GitHubUserResponse) ?? null,
    getToken: (conn) => (typeof conn.token === 'string' ? conn.token : null),
    fetchRepos: (token) => fetchGitHubRepos(token),
    onClose,
    sanitizeName: sanitizeRepoName,
    extraFilter: (repo, query) => Boolean(repo.language && repo.language.toLowerCase().includes(query)),
  });

  // React-based overwrite confirmation (replaces window.confirm)
  const overwriteResolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [overwriteConfirmMessage, setOverwriteConfirmMessage] = useState('');

  function requestOverwriteConfirmation(message: string): Promise<boolean> {
    setOverwriteConfirmMessage(message);
    setShowOverwriteConfirm(true);

    return new Promise<boolean>((resolve) => {
      overwriteResolveRef.current = resolve;
    });
  }

  function handleOverwriteResponse(confirmed: boolean) {
    setShowOverwriteConfirm(false);
    overwriteResolveRef.current?.(confirmed);
    overwriteResolveRef.current = null;
  }

  // Function to create a new repository or push to an existing one
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const connection = getLocalStorage('github_connection');

    if (!connection?.token || !connection?.user) {
      toast.error('Please connect your GitHub account in Settings > Connections first');
      return;
    }

    if (!dialog.repoName.trim()) {
      toast.error('Repository name is required');
      return;
    }

    // Validate and sanitize repository name (single call, reused throughout)
    const sanitizedRepoName = sanitizeRepoName(dialog.repoName);

    if (!sanitizedRepoName || sanitizedRepoName.length < 1) {
      toast.error('Repository name must contain at least one alphanumeric character');
      return;
    }

    if (sanitizedRepoName.length > 100) {
      toast.error('Repository name is too long (maximum 100 characters)');
      return;
    }

    // Update the repo name field with the sanitized version if it was changed
    if (sanitizedRepoName !== dialog.repoName) {
      dialog.setRepoName(sanitizedRepoName);
      toast.info(`Repository name sanitized to: ${sanitizedRepoName}`);
    }

    dialog.setIsLoading(true);

    try {
      // Initialize Octokit with the GitHub token
      const octokit = new Octokit({ auth: connection.token });
      let repoExists = false;

      try {
        // Check if the repository already exists
        const { data: existingRepo } = await octokit.repos.get({
          owner: connection.user.login,
          repo: sanitizedRepoName,
        });

        repoExists = true;

        // If we get here, the repo exists - confirm overwrite
        let confirmMessage = `Repository "${dialog.repoName}" already exists. Do you want to update it? This will add or modify files in the repository.`;

        // Add visibility change warning if needed
        if (existingRepo.private !== dialog.isPrivate) {
          const visibilityChange = dialog.isPrivate
            ? 'This will also change the repository from public to private.'
            : 'This will also change the repository from private to public.';

          confirmMessage += `\n\n${visibilityChange}`;
        }

        const confirmOverwrite = await requestOverwriteConfirmation(confirmMessage);

        if (!confirmOverwrite) {
          dialog.setIsLoading(false);
          return;
        }

        // If visibility needs to be updated
        if (existingRepo.private !== dialog.isPrivate) {
          await octokit.repos.update({
            owner: connection.user.login,
            repo: sanitizedRepoName,
            private: dialog.isPrivate,
          });
        }
      } catch (error: unknown) {
        // 404 means repo doesn't exist, which is what we want for new repos
        if (
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          (error as { status: number }).status !== 404
        ) {
          throw error;
        }
      }

      // Create repository if it doesn't exist
      if (!repoExists) {
        const { data: newRepo } = await octokit.repos.createForAuthenticatedUser({
          name: sanitizedRepoName,
          private: dialog.isPrivate,

          // Initialize with a README to avoid empty repository issues
          auto_init: true,

          // Create a .gitignore file for the project
          gitignore_template: 'Node',
        });

        // Set the URL for success dialog
        dialog.setCreatedRepoUrl(newRepo.html_url);

        // Since we created the repo with auto_init, we need to wait for GitHub to initialize it
        logger.debug('Created new repository with auto_init, waiting for GitHub to initialize it...');

        // Wait a moment for GitHub to set up the initial commit
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } else {
        // Set URL for existing repo
        dialog.setCreatedRepoUrl(`https://github.com/${connection.user.login}/${sanitizedRepoName}`);
      }

      // Process files to upload
      const fileEntries = Object.entries(files);

      // Filter out files and format them for display
      const fileList = fileEntries.map(([filePath, fileData]) => {
        // The paths are already properly formatted in the GitHubDeploy component
        return {
          path: filePath,
          size: fileData.isBinary
            ? Math.ceil((fileData.content.length * 3) / 4) // approximate decoded base64 size
            : new TextEncoder().encode(fileData.content).length,
        };
      });

      dialog.setPushedFiles(fileList);

      /*
       * Now we need to handle the repository, whether it's new or existing
       * Get the default branch for the repository
       */
      let defaultBranch: string;
      let baseSha: string | null = null;

      try {
        // For both new and existing repos, get the repository info
        const { data: repo } = await octokit.repos.get({
          owner: connection.user.login,
          repo: sanitizedRepoName,
        });
        defaultBranch = repo.default_branch || 'main';
        logger.trace(`Repository default branch: ${defaultBranch}`);

        // For a newly created repo (or existing one), get the reference to the default branch
        try {
          const { data: refData } = await octokit.git.getRef({
            owner: connection.user.login,
            repo: sanitizedRepoName,
            ref: `heads/${defaultBranch}`,
          });

          baseSha = refData.object.sha;
          logger.trace(`Found existing reference with SHA: ${baseSha}`);

          // Get the latest commit to use as a base for our tree
          const { data: commitData } = await octokit.git.getCommit({
            owner: connection.user.login,
            repo: sanitizedRepoName,
            commit_sha: baseSha,
          });

          // Store the base tree SHA for tree creation
          baseSha = commitData.tree.sha;
          logger.trace(`Using base tree SHA: ${baseSha}`);
        } catch (refError) {
          logger.error('Error getting reference:', refError);
          baseSha = null;
        }
      } catch (repoError) {
        logger.error('Error getting repository info:', repoError);
        defaultBranch = 'main';
        baseSha = null;
      }

      try {
        logger.debug('Creating tree for repository');

        // Create a tree with all files — binary files need blobs created first
        const tree: Array<{
          path: string;
          mode: '100644';
          type: 'blob';
          content?: string;
          sha?: string;
        }> = [];

        for (const [filePath, fileData] of fileEntries) {
          if (fileData.isBinary) {
            // Binary files: create a blob with base64 encoding, then reference its SHA
            const { data: blobData } = await octokit.git.createBlob({
              owner: connection.user.login,
              repo: sanitizedRepoName,
              content: fileData.content,
              encoding: 'base64',
            });
            tree.push({
              path: filePath,
              mode: '100644' as const,
              type: 'blob' as const,
              sha: blobData.sha,
            });
          } else {
            // Text files: inline content
            tree.push({
              path: filePath,
              mode: '100644' as const,
              type: 'blob' as const,
              content: fileData.content,
            });
          }
        }

        logger.debug(`Creating tree with ${tree.length} files using base: ${baseSha || 'none'}`);

        // Create a tree with all the files, using the base tree if available
        const { data: treeData } = await octokit.git.createTree({
          owner: connection.user.login,
          repo: sanitizedRepoName,
          tree,
          base_tree: baseSha || undefined,
        });

        logger.debug('Tree created successfully', treeData.sha);

        // Get the current reference to use as parent for our commit
        let parentCommitSha: string | null = null;

        try {
          const { data: refData } = await octokit.git.getRef({
            owner: connection.user.login,
            repo: sanitizedRepoName,
            ref: `heads/${defaultBranch}`,
          });
          parentCommitSha = refData.object.sha;
          logger.debug(`Found parent commit: ${parentCommitSha}`);
        } catch (refError) {
          logger.debug('No reference found, this is a brand new repo', refError);
          parentCommitSha = null;
        }

        // Create a commit with the tree
        logger.debug('Creating commit');

        const { data: commitData } = await octokit.git.createCommit({
          owner: connection.user.login,
          repo: sanitizedRepoName,
          message: !repoExists ? 'Initial commit' : 'Update',
          tree: treeData.sha,
          parents: parentCommitSha ? [parentCommitSha] : [], // Use parent if available
        });

        logger.debug('Commit created successfully', commitData.sha);

        // Update the reference to point to the new commit
        try {
          logger.debug(`Updating reference: heads/${defaultBranch} to ${commitData.sha}`);
          await octokit.git.updateRef({
            owner: connection.user.login,
            repo: sanitizedRepoName,
            ref: `heads/${defaultBranch}`,
            sha: commitData.sha,
            force: true, // Use force to ensure the update works
          });
          logger.debug('Reference updated successfully');
        } catch (refError) {
          logger.debug('Failed to update reference, attempting to create it', refError);

          // If the reference doesn't exist, create it (shouldn't happen with auto_init, but just in case)
          try {
            await octokit.git.createRef({
              owner: connection.user.login,
              repo: sanitizedRepoName,
              ref: `refs/heads/${defaultBranch}`,
              sha: commitData.sha,
            });
            logger.debug('Reference created successfully');
          } catch (createRefError) {
            logger.error('Error creating reference:', createRefError);

            const errorMsg =
              typeof createRefError === 'object' && createRefError !== null && 'message' in createRefError
                ? String(createRefError.message)
                : 'Unknown error';
            throw new Error(`Failed to create Git reference: ${errorMsg}`);
          }
        }
      } catch (gitError) {
        logger.error('Error with git operations:', gitError);

        const gitErrorMsg =
          typeof gitError === 'object' && gitError !== null && 'message' in gitError
            ? String(gitError.message)
            : 'Unknown error';
        throw new Error(`Failed during git operations: ${gitErrorMsg}`);
      }

      // Save the repository information for this chat
      localStorage.setItem(
        `github-repo-${currentChatId}`,
        JSON.stringify({
          owner: connection.user.login,
          name: sanitizedRepoName,
          url: `https://github.com/${connection.user.login}/${sanitizedRepoName}`,
        }),
      );

      // Show success dialog
      dialog.setShowSuccessDialog(true);
    } catch (error) {
      logger.error('Error pushing to GitHub:', error);

      const classified = classifyDeploymentError(error);

      // Show error with retry suggestion if applicable
      const finalMessage = classified.isRetryable ? `${classified.message} Click to retry.` : classified.message;
      toast.error(finalMessage);
    } finally {
      dialog.setIsLoading(false);
    }
  };

  if (dialog.showSuccessDialog) {
    return (
      <DeploymentSuccessDialog
        isOpen={isOpen}
        onClose={dialog.handleClose}
        provider={GITHUB_PROVIDER}
        repoUrl={dialog.createdRepoUrl}
        pushedFiles={dialog.pushedFiles}
      />
    );
  }

  if (!dialog.user) {
    return (
      <ConnectionRequiredDialog
        isOpen={isOpen}
        onClose={dialog.handleClose}
        provider={GITHUB_PROVIDER}
        onConnect={() => dialog.setShowAuthDialog(true)}
      >
        <GitHubAuthDialog isOpen={dialog.showAuthDialog} onClose={dialog.handleAuthDialogClose} />
      </ConnectionRequiredDialog>
    );
  }

  return (
    <>
      <DeploymentFormShell
        isOpen={isOpen}
        onClose={dialog.handleClose}
        brandColor="purple"
        providerIcon="i-ph:github-logo"
        providerName="GitHub"
        avatarUrl={dialog.user.avatar_url}
        displayName={dialog.user.name || dialog.user.login}
        username={dialog.user.login}
        repoName={dialog.repoName}
        onRepoNameChange={dialog.setRepoName}
        showSanitizedPreview={true}
        repoNameMaxLength={100}
        isPrivate={dialog.isPrivate}
        onPrivateChange={dialog.setIsPrivate}
        isLoading={dialog.isLoading}
        onSubmit={handleSubmit}
      >
        <RepoListSection<GitHubRepoInfo>
          recentRepos={dialog.recentRepos}
          filteredRepos={dialog.filteredRepos}
          repoSearchQuery={dialog.repoSearchQuery}
          isFetchingRepos={dialog.isFetchingRepos}
          brandColor="purple"
          providerIcon="i-ph:github-logo"
          onSearchChange={dialog.setRepoSearchQuery}
          onSearchClear={() => dialog.setRepoSearchQuery('')}
          onSelectRepo={dialog.setRepoName}
          getRepoKey={(repo) => repo.full_name}
          isPrivate={(repo) => Boolean(repo.private)}
          renderBadges={(repo) => (
            <>
              {repo.language && (
                <Badge variant="subtle" size="sm" icon="i-ph:code w-3 h-3">
                  {repo.language}
                </Badge>
              )}
              <Badge variant="subtle" size="sm" icon="i-ph:star w-3 h-3">
                {repo.stargazers_count.toLocaleString()}
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

      {/* GitHub Auth Dialog */}
      <GitHubAuthDialog isOpen={dialog.showAuthDialog} onClose={dialog.handleAuthDialogClose} />

      {/* Overwrite Confirmation Dialog */}
      {showOverwriteConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50">
          <div className="bg-ui-background-depth-2 border border-ui-borderColor rounded-xl p-6 max-w-md mx-4 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <div className="i-ph:warning-circle w-5 h-5 text-yellow-500" />
              <h3 className="text-sm font-semibold text-ui-textPrimary">Confirm Overwrite</h3>
            </div>
            <p className="text-sm text-ui-textSecondary whitespace-pre-line mb-5">{overwriteConfirmMessage}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handleOverwriteResponse(false)}
                className="px-4 py-2 text-sm rounded-lg border border-ui-borderColor text-ui-textSecondary hover:bg-ui-item-backgroundActive transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleOverwriteResponse(true)}
                className="px-4 py-2 text-sm rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors"
              >
                Update Repository
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
