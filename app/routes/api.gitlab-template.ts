import { json } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { getApiKeysFromVault } from '~/lib/.server/api-key-vault';
import { fetchWithTimeout } from '~/utils/fetchWithTimeout';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.gitlab-template');

/**
 * Validate that a URL is safe for server-side fetching (SSRF prevention).
 * Must use https:// and must not target private/loopback IP ranges.
 */
function validateGitlabUrl(urlString: string): { valid: boolean; error?: string } {
  let parsed: URL;

  try {
    parsed = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Only https:// URLs are allowed' };
  }

  const hostname = parsed.hostname;

  // Block private/loopback IP ranges
  const privatePatterns = [
    /^127\.\d+\.\d+\.\d+$/, // loopback
    /^10\.\d+\.\d+\.\d+$/, // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // 172.16.0.0/12
    /^192\.168\.\d+\.\d+$/, // 192.168.0.0/16
    /^169\.254\.\d+\.\d+$/, // link-local
    /^0\.0\.0\.0$/, // unspecified
    /^::1$/, // IPv6 loopback
    /^\[::1\]$/, // IPv6 loopback bracketed
    /^localhost$/i, // localhost
  ];

  if (privatePatterns.some((pattern) => pattern.test(hostname))) {
    return { valid: false, error: 'URLs targeting private/internal networks are not allowed' };
  }

  return { valid: true };
}

interface GitLabTreeItem {
  id: string;
  name: string;
  type: 'tree' | 'blob';
  path: string;
  mode: string;
}

// Fetch repository contents using GitLab Repository Tree API (paginated)
async function fetchRepoContentsFromTree(gitlabUrl: string, projectId: string, gitlabToken: string, ref?: string) {
  const encodedProjectId = encodeURIComponent(projectId);
  const fileContents: Array<{ name: string; path: string; content: string }> = [];

  // Fetch the full tree recursively
  let page = 1;
  let allItems: GitLabTreeItem[] = [];

  while (true) {
    const treeUrl = `${gitlabUrl}/api/v4/projects/${encodedProjectId}/repository/tree?recursive=true&per_page=100&page=${page}${ref ? `&ref=${encodeURIComponent(ref)}` : ''}`;

    const treeResponse = await fetchWithTimeout(treeUrl, {
      headers: {
        Accept: 'application/json',
        'Private-Token': gitlabToken,
        'User-Agent': 'app',
      },
      timeoutMs: 15000,
    });

    if (!treeResponse.ok) {
      throw new Error(`Failed to fetch repository tree: ${treeResponse.status}`);
    }

    const items: GitLabTreeItem[] = await treeResponse.json();

    if (items.length === 0) {
      break;
    }

    allItems = allItems.concat(items);
    page++;

    // Safety limit
    if (page > 50) {
      break;
    }
  }

  // Filter for blobs (files) only, skip .git paths
  const files = allItems.filter((item) => {
    if (item.type !== 'blob') {
      return false;
    }

    if (item.path.startsWith('.git/')) {
      return false;
    }

    return true;
  });

  // Fetch file contents in batches
  const batchSize = 10;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const batchPromises = batch.map(async (file) => {
      try {
        const fileUrl = `${gitlabUrl}/api/v4/projects/${encodedProjectId}/repository/files/${encodeURIComponent(file.path)}/raw${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;

        const fileResponse = await fetchWithTimeout(fileUrl, {
          headers: {
            'Private-Token': gitlabToken,
            'User-Agent': 'app',
          },
          timeoutMs: 15000,
        });

        if (!fileResponse.ok) {
          logger.warn(`Failed to fetch ${file.path}: ${fileResponse.status}`);
          return null;
        }

        const content = await fileResponse.text();

        return {
          name: file.name,
          path: file.path,
          content,
        };
      } catch (error) {
        logger.warn(`Error fetching ${file.path}:`, error);
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    fileContents.push(...(batchResults.filter(Boolean) as Array<{ name: string; path: string; content: string }>));

    // Add a small delay between batches to be respectful to the API
    if (i + batchSize < files.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return fileContents;
}

export const loader = withSecurity(async ({ request, context }: { request: Request; context: any }) => {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');
  const ref = url.searchParams.get('sha') || url.searchParams.get('ref') || undefined;
  const gitlabUrl = url.searchParams.get('gitlabUrl') || 'https://gitlab.com';

  if (!projectId) {
    return json({ error: 'Project ID is required (use projectId query parameter)' }, { status: 400 });
  }

  // Validate gitlabUrl to prevent SSRF
  const urlValidation = validateGitlabUrl(gitlabUrl);

  if (!urlValidation.valid) {
    return json({ error: `Invalid GitLab URL: ${urlValidation.error}` }, { status: 400 });
  }

  try {
    // Get API keys from vault (server-side only)
    const cookieHeader = request.headers.get('Cookie');
    const env = (context?.cloudflare?.env as unknown as Record<string, string>) || {};
    const apiKeys = await getApiKeysFromVault(cookieHeader, env);

    // Try to get GitLab token from various sources
    const gitlabToken =
      apiKeys.GITLAB_API_KEY ||
      apiKeys.GITLAB_TOKEN ||
      context?.cloudflare?.env?.GITLAB_TOKEN ||
      process.env.GITLAB_TOKEN;

    if (!gitlabToken) {
      return json({ error: 'GitLab token not found' }, { status: 401 });
    }

    const fileList = await fetchRepoContentsFromTree(gitlabUrl, projectId, gitlabToken, ref);

    // Filter out .git files
    const filteredFiles = fileList.filter((file) => !file.path.startsWith('.git'));

    return json(filteredFiles);
  } catch (error) {
    logger.error('Error processing GitLab template:', error);
    logger.error('Project ID:', projectId);
    logger.error('Error details:', error instanceof Error ? error.message : String(error));

    return json(
      {
        error: 'Failed to fetch template files',
      },
      { status: 500 },
    );
  }
});
