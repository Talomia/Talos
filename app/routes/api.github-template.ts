import { json } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { fetchWithTimeout } from '~/utils/fetchWithTimeout';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.github-template');
import JSZip from 'jszip';

interface GitHubRepoResponse {
  default_branch: string;
}

interface GitHubTreeItem {
  path: string;
  type: string;
  size?: number;
}

interface GitHubTreeResponse {
  tree: GitHubTreeItem[];
}

interface GitHubContentResponse {
  content: string;
}

// Function to detect if we're running in Cloudflare
function isCloudflareEnvironment(context: { cloudflare?: { env?: Partial<Env> } }): boolean {
  // Check if we're in production AND have Cloudflare Pages specific env vars
  const isProduction = process.env.NODE_ENV === 'production';
  const hasCfPagesVars = !!(
    context?.cloudflare?.env?.CF_PAGES ||
    context?.cloudflare?.env?.CF_PAGES_URL ||
    context?.cloudflare?.env?.CF_PAGES_COMMIT_SHA
  );

  return isProduction && hasCfPagesVars;
}

// Cloudflare-compatible method using GitHub Contents API
async function fetchRepoContentsCloudflare(repo: string, githubToken?: string) {
  const baseUrl = 'https://api.github.com';

  // Get repository info to find default branch
  const repoResponse = await fetchWithTimeout(`${baseUrl}/repos/${repo}`, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'app',
      ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
    },
    timeoutMs: 15000,
  });

  if (!repoResponse.ok) {
    throw new Error(`Repository not found: ${repo}`);
  }

  const repoData = (await repoResponse.json()) as GitHubRepoResponse;
  const defaultBranch = repoData.default_branch;

  // Get the tree recursively
  const treeResponse = await fetchWithTimeout(`${baseUrl}/repos/${repo}/git/trees/${defaultBranch}?recursive=1`, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'app',
      ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
    },
    timeoutMs: 15000,
  });

  if (!treeResponse.ok) {
    throw new Error(`Failed to fetch repository tree: ${treeResponse.status}`);
  }

  const treeData = (await treeResponse.json()) as GitHubTreeResponse;

  // Filter for files only (not directories) and limit size
  const files = treeData.tree.filter((item) => {
    if (item.type !== 'blob') {
      return false;
    }

    if (item.path.startsWith('.git/')) {
      return false;
    }

    // Allow lock files even if they're large
    const isLockFile =
      item.path.endsWith('package-lock.json') ||
      item.path.endsWith('yarn.lock') ||
      item.path.endsWith('pnpm-lock.yaml');

    // For non-lock files, limit size to 100KB
    if (!isLockFile && (item.size ?? 0) >= 100000) {
      return false;
    }

    return true;
  });

  // Fetch file contents in batches to avoid overwhelming the API
  const batchSize = 10;
  const fileContents = [];

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const batchPromises = batch.map(async (file: any) => {
      try {
        const contentResponse = await fetchWithTimeout(`${baseUrl}/repos/${repo}/contents/${file.path}`, {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'app',
            ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
          },
          timeoutMs: 15000,
        });

        if (!contentResponse.ok) {
          logger.warn(`Failed to fetch ${file.path}: ${contentResponse.status}`);
          return null;
        }

        const contentData = (await contentResponse.json()) as GitHubContentResponse;
        const content = atob(contentData.content.replace(/\s/g, ''));

        return {
          name: file.path.split('/').pop() || '',
          path: file.path,
          content,
        };
      } catch (error) {
        logger.warn(`Error fetching ${file.path}:`, error);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    fileContents.push(...batchResults.filter(Boolean));

    // Add a small delay between batches to be respectful to the API
    if (i + batchSize < files.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return fileContents;
}

// Your existing method for non-Cloudflare environments
async function fetchRepoContentsZip(repo: string, githubToken?: string) {
  let zipResponse;
  let errorMsg = '';

  // Try API first if token is available
  if (githubToken) {
    try {
      const apiZipballUrl = `https://api.github.com/repos/${repo}/zipball`;
      zipResponse = await fetchWithTimeout(apiZipballUrl, {
        headers: {
          'User-Agent': 'app',
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${githubToken}`,
        },
        timeoutMs: 30000,
      });
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
      logger.warn(`API zipball fetch failed: ${errorMsg}. Falling back to public zipball.`);
    }
  }

  // Fallback/direct public download if no token, or if API failed
  if (!zipResponse || !zipResponse.ok) {
    const publicZipballUrl = `https://github.com/${repo}/zipball/HEAD`;
    logger.info(`Fetching public zipball from ${publicZipballUrl}`);

    try {
      zipResponse = await fetchWithTimeout(publicZipballUrl, {
        headers: {
          'User-Agent': 'app',
        },
        timeoutMs: 30000,
      });
    } catch (e) {
      throw new Error(`Failed to fetch public repository zipball: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!zipResponse.ok) {
    throw new Error(`Failed to fetch repository zipball: ${zipResponse.status} - ${zipResponse.statusText}`);
  }

  // Get the zip content as ArrayBuffer
  const zipArrayBuffer = await zipResponse.arrayBuffer();

  // Use JSZip to extract the contents
  const zip = await JSZip.loadAsync(zipArrayBuffer);

  // Find the root folder name
  let rootFolderName = '';
  zip.forEach((relativePath) => {
    if (!rootFolderName && relativePath.includes('/')) {
      rootFolderName = relativePath.split('/')[0];
    }
  });

  // Extract all files
  const promises = Object.keys(zip.files).map(async (filename) => {
    const zipEntry = zip.files[filename];

    // Skip directories
    if (zipEntry.dir) {
      return null;
    }

    // Skip the root folder itself
    if (filename === rootFolderName) {
      return null;
    }

    // Remove the root folder from the path
    let normalizedPath = filename;

    if (rootFolderName && filename.startsWith(rootFolderName + '/')) {
      normalizedPath = filename.substring(rootFolderName.length + 1);
    }

    // Get the file content
    const content = await zipEntry.async('string');

    return {
      name: normalizedPath.split('/').pop() || '',
      path: normalizedPath,
      content,
    };
  });

  const results = await Promise.all(promises);

  return results.filter(Boolean);
}

export const loader = withSecurity(async ({ request, context }: { request: Request; context: any }) => {
  const url = new URL(request.url);
  const repo = url.searchParams.get('repo');

  if (!repo) {
    return json({ error: 'Repository name is required' }, { status: 400 });
  }

  // Validate repo format: must be owner/repo with safe characters
  if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repo)) {
    return json({ error: 'Invalid repository format. Expected owner/repo' }, { status: 400 });
  }

  try {
    // Access environment variables from Cloudflare context or process.env
    const githubToken =
      context?.cloudflare?.env?.GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.VITE_GITHUB_ACCESS_TOKEN;

    let fileList;

    if (isCloudflareEnvironment(context)) {
      fileList = await fetchRepoContentsCloudflare(repo, githubToken);
    } else {
      fileList = await fetchRepoContentsZip(repo, githubToken);
    }

    // Filter out .git files for both methods
    const filteredFiles = fileList.filter((file: any) => !file.path.startsWith('.git'));

    return json(filteredFiles);
  } catch (error) {
    logger.error('Error processing GitHub template:', error);
    logger.error('Repository:', repo);
    logger.error('Error details:', error instanceof Error ? error.message : String(error));

    return json(
      {
        error: 'Failed to fetch template files',
      },
      { status: 500 },
    );
  }
});
