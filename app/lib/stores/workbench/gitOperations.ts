import { Octokit, type RestEndpointMethodTypes } from '@octokit/rest';
import Cookies from 'js-cookie';
import type { FileMap } from '~/lib/stores/files';
import { extractRelativePath } from '~/utils/diff';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WorkbenchStore:GitOperations');

/**
 * Push files to a GitHub or GitLab repository.
 *
 * This function encapsulates all the logic that was previously part of
 * `WorkbenchStore.pushToRepository`, keeping the store focused on
 * orchestration rather than transport details.
 */
export async function pushToRepository(
  getFiles: () => FileMap,
  provider: 'github' | 'gitlab',
  repoName: string,
  commitMessage?: string,
  username?: string,
  token?: string,
  isPrivate: boolean = false,
  branchName: string = 'main',
): Promise<string> {
  try {
    const isGitHub = provider === 'github';
    const isGitLab = provider === 'gitlab';

    const authToken = token || Cookies.get(isGitHub ? 'githubToken' : 'gitlabToken');
    const owner = username || Cookies.get(isGitHub ? 'githubUsername' : 'gitlabUsername');

    if (!authToken || !owner) {
      throw new Error(`${provider} token or username is not set in cookies or provided.`);
    }

    const files = getFiles();

    if (!files || Object.keys(files).length === 0) {
      throw new Error('No files found to push');
    }

    if (isGitHub) {
      return await pushToGitHub(files, authToken, owner, repoName, commitMessage, isPrivate);
    }

    if (isGitLab) {
      return await pushToGitLab(files, authToken, owner, repoName, commitMessage, isPrivate, branchName);
    }

    // Should not reach here since we only handle GitHub and GitLab
    throw new Error(`Unsupported provider: ${provider}`);
  } catch (error) {
    logger.error('Error pushing to repository:', error);
    throw error; // Rethrow the error for further handling
  }
}

/*
 * ---------------------------------------------------------------------------
 * GitHub
 * ---------------------------------------------------------------------------
 */

async function pushToGitHub(
  files: FileMap,
  authToken: string,
  owner: string,
  repoName: string,
  commitMessage: string | undefined,
  isPrivate: boolean,
): Promise<string> {
  // Initialize Octokit with the auth token
  const octokit = new Octokit({ auth: authToken });

  // Check if the repository already exists before creating it
  let repo: RestEndpointMethodTypes['repos']['get']['response']['data'];
  let visibilityJustChanged = false;

  try {
    const resp = await octokit.repos.get({ owner, repo: repoName });
    repo = resp.data;
    logger.debug('Repository already exists, using existing repo');

    // Check if we need to update visibility of existing repo
    if (repo.private !== isPrivate) {
      logger.debug(
        `Updating repository visibility from ${repo.private ? 'private' : 'public'} to ${isPrivate ? 'private' : 'public'}`,
      );

      try {
        // Update repository visibility using the update method
        const { data: updatedRepo } = await octokit.repos.update({
          owner,
          repo: repoName,
          private: isPrivate,
        });

        logger.debug('Repository visibility updated successfully');
        repo = updatedRepo;
        visibilityJustChanged = true;

        // Add a delay after changing visibility to allow GitHub to fully process the change
        logger.trace('Waiting for visibility change to propagate...');
        await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 second delay
      } catch (visibilityError) {
        logger.error('Failed to update repository visibility:', visibilityError);

        // Continue with push even if visibility update fails
      }
    }
  } catch (error) {
    if (error instanceof Error && 'status' in error && error.status === 404) {
      // Repository doesn't exist, so create a new one
      logger.debug(`Creating new repository with private=${isPrivate}`);

      // Create new repository with specified privacy setting
      const createRepoOptions = {
        name: repoName,
        private: isPrivate,
        auto_init: true,
      };

      logger.trace('Create repo options:', createRepoOptions);

      const { data: newRepo } = await octokit.repos.createForAuthenticatedUser(createRepoOptions);

      logger.debug('Repository created:', newRepo.html_url, 'Private:', newRepo.private);
      repo = newRepo;

      // Add a small delay after creating a repository to allow GitHub to fully initialize it
      logger.trace('Waiting for repository to initialize...');
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
    } else {
      logger.error('Cannot create repo:', error);
      throw error; // Some other error occurred
    }
  }

  // Get all files
  if (!files || Object.keys(files).length === 0) {
    throw new Error('No files found to push');
  }

  // Function to push files with retry logic
  const pushFilesToRepo = async (attempt = 1): Promise<string> => {
    const maxAttempts = 3;

    try {
      logger.trace(`Pushing files to repository (attempt ${attempt}/${maxAttempts})...`);

      // Create blobs for each file
      const blobs = await Promise.all(
        Object.entries(files).map(async ([filePath, dirent]) => {
          if (dirent?.type === 'file' && dirent.content) {
            const { data: blob } = await octokit.git.createBlob({
              owner: repo.owner.login,
              repo: repo.name,
              content: Buffer.from(dirent.content).toString('base64'),
              encoding: 'base64',
            });
            return { path: extractRelativePath(filePath), sha: blob.sha };
          }

          return null;
        }),
      );

      const validBlobs = blobs.filter(Boolean); // Filter out any undefined blobs

      if (validBlobs.length === 0) {
        throw new Error('No valid files to push');
      }

      // Refresh repository reference to ensure we have the latest data
      const repoRefresh = await octokit.repos.get({ owner, repo: repoName });
      repo = repoRefresh.data;

      // Get the latest commit SHA (assuming main branch, update dynamically if needed)
      const { data: ref } = await octokit.git.getRef({
        owner: repo.owner.login,
        repo: repo.name,
        ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
      });
      const latestCommitSha = ref.object.sha;

      // Create a new tree
      const { data: newTree } = await octokit.git.createTree({
        owner: repo.owner.login,
        repo: repo.name,
        base_tree: latestCommitSha,
        tree: validBlobs.map((blob) => ({
          path: blob!.path,
          mode: '100644',
          type: 'blob',
          sha: blob!.sha,
        })),
      });

      // Create a new commit
      const { data: newCommit } = await octokit.git.createCommit({
        owner: repo.owner.login,
        repo: repo.name,
        message: commitMessage || 'Initial commit from your app',
        tree: newTree.sha,
        parents: [latestCommitSha],
      });

      // Update the reference
      await octokit.git.updateRef({
        owner: repo.owner.login,
        repo: repo.name,
        ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
        sha: newCommit.sha,
      });

      logger.debug('Files successfully pushed to repository');

      return repo.html_url;
    } catch (error) {
      logger.error(`Error during push attempt ${attempt}:`, error);

      // If we've just changed visibility and this is not our last attempt, wait and retry
      if ((visibilityJustChanged || attempt === 1) && attempt < maxAttempts) {
        const delayMs = attempt * 2000; // Increasing delay with each attempt
        logger.trace(`Waiting ${delayMs}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        return pushFilesToRepo(attempt + 1);
      }

      throw error; // Rethrow if we're out of attempts
    }
  };

  // Execute the push function with retry logic
  const repoUrl = await pushFilesToRepo();

  // Return the repository URL
  return repoUrl;
}

/*
 * ---------------------------------------------------------------------------
 * GitLab
 * ---------------------------------------------------------------------------
 */

async function pushToGitLab(
  files: FileMap,
  authToken: string,
  owner: string,
  repoName: string,
  commitMessage: string | undefined,
  isPrivate: boolean,
  branchName: string,
): Promise<string> {
  const { GitLabApiService: gitLabApiServiceClass } = await import('~/lib/services/gitlabApiService');
  const gitLabApiService = new gitLabApiServiceClass(authToken, 'https://gitlab.com');

  // Check or create repo
  let repo = await gitLabApiService.getProject(owner, repoName);

  if (!repo) {
    repo = await gitLabApiService.createProject(repoName, isPrivate);
    await new Promise((r) => setTimeout(r, 2000)); // Wait for repo initialization
  }

  // Check if branch exists, create if not
  const branchRes = await gitLabApiService.getFile(repo.id, 'README.md', branchName).catch(() => null);

  if (!branchRes || !branchRes.ok) {
    // Create branch from default
    await gitLabApiService.createBranch(repo.id, branchName, repo.default_branch);
    await new Promise((r) => setTimeout(r, 1000));
  }

  const actions = Object.entries(files).reduce(
    (acc, [filePath, dirent]) => {
      if (dirent?.type === 'file' && dirent.content) {
        acc.push({
          action: 'create',
          file_path: extractRelativePath(filePath),
          content: dirent.content,
        });
      }

      return acc;
    },
    [] as { action: 'create' | 'update'; file_path: string; content: string }[],
  );

  // Check which files exist and update action accordingly
  for (const action of actions) {
    const fileCheck = await gitLabApiService.getFile(repo.id, action.file_path, branchName);

    if (fileCheck.ok) {
      action.action = 'update';
    }
  }

  // Commit all files
  await gitLabApiService.commitFiles(repo.id, {
    branch: branchName,
    commit_message: commitMessage || 'Commit multiple files',
    actions,
  });

  return repo.web_url;
}
