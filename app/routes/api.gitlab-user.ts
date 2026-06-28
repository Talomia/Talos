import { json } from '@remix-run/cloudflare';
import { createScopedLogger } from '~/utils/logger';
import { getApiKeysFromVault } from '~/lib/.server/api-key-vault';
import { withSecurity } from '~/lib/security';
import { getServerEnv } from '~/utils/env';
import { fetchWithTimeout } from '~/utils/fetchWithTimeout';

const logger = createScopedLogger('api.gitlab-user');

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

async function gitlabUserLoader({ request, context }: { request: Request; context: any }) {
  try {
    const url = new URL(request.url);
    const gitlabUrl = url.searchParams.get('gitlabUrl') || 'https://gitlab.com';

    // Validate gitlabUrl to prevent SSRF
    const urlValidation = validateGitlabUrl(gitlabUrl);

    if (!urlValidation.valid) {
      return json({ error: `Invalid GitLab URL: ${urlValidation.error}` }, { status: 400 });
    }

    // Get API keys from vault (server-side only)
    const cookieHeader = request.headers.get('Cookie');
    const env = getServerEnv(context);
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

    // Make server-side request to GitLab API
    const response = await fetchWithTimeout(`${gitlabUrl}/api/v4/user`, {
      headers: {
        Accept: 'application/json',
        'Private-Token': gitlabToken,
        'User-Agent': 'app',
      },
      timeoutMs: 15000,
    });

    if (!response.ok) {
      if (response.status === 401) {
        return json({ error: 'Invalid GitLab token' }, { status: 401 });
      }

      throw new Error(`GitLab API error: ${response.status}`);
    }

    const userData = (await response.json()) as {
      username: string;
      name: string;
      avatar_url: string;
      web_url: string;
      email: string;
      state: string;
    };

    return json({
      username: userData.username,
      name: userData.name,
      avatar_url: userData.avatar_url,
      web_url: userData.web_url,
      email: userData.email,
      state: userData.state,
    });
  } catch (error) {
    logger.error('Error fetching GitLab user:', error);
    return json(
      {
        error: 'Failed to fetch GitLab user information',
        details: 'An internal error occurred',
      },
      { status: 500 },
    );
  }
}

export const loader = withSecurity(gitlabUserLoader, {
  rateLimit: true,
  allowedMethods: ['GET'],
});

async function gitlabUserAction({ request, context }: { request: Request; context: any }) {
  try {
    let action: string | null = null;
    let projectId: string | null = null;
    let searchQuery: string | null = null;
    let perPage: number = 30;
    let gitlabUrl: string = 'https://gitlab.com';

    // Handle both JSON and form data
    const contentType = request.headers.get('Content-Type') || '';

    if (contentType.includes('application/json')) {
      const jsonData = (await request.json()) as {
        action?: string;
        projectId?: string;
        query?: string;
        per_page?: number;
        gitlabUrl?: string;
      };
      action = jsonData.action ?? null;
      projectId = jsonData.projectId ?? null;
      searchQuery = jsonData.query ?? null;
      perPage = jsonData.per_page || 30;
      gitlabUrl = jsonData.gitlabUrl || 'https://gitlab.com';
    } else {
      const formData = await request.formData();
      action = formData.get('action') as string;
      projectId = formData.get('projectId') as string;
      searchQuery = formData.get('query') as string;
      perPage = parseInt(formData.get('per_page') as string) || 30;
      gitlabUrl = (formData.get('gitlabUrl') as string) || 'https://gitlab.com';
    }

    // Validate gitlabUrl to prevent SSRF
    const urlValidation = validateGitlabUrl(gitlabUrl);

    if (!urlValidation.valid) {
      return json({ error: `Invalid GitLab URL: ${urlValidation.error}` }, { status: 400 });
    }

    // Get API keys from vault (server-side only)
    const cookieHeader = request.headers.get('Cookie');
    const env = getServerEnv(context);
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

    if (action === 'get_projects') {
      // Fetch user projects
      const response = await fetchWithTimeout(
        `${gitlabUrl}/api/v4/projects?membership=true&per_page=100&order_by=updated_at&sort=desc`,
        {
          headers: {
            Accept: 'application/json',
            'Private-Token': gitlabToken,
            'User-Agent': 'app',
          },
          timeoutMs: 15000,
        },
      );

      if (!response.ok) {
        throw new Error(`GitLab API error: ${response.status}`);
      }

      const projects = (await response.json()) as Array<{
        id: number;
        name: string;
        path_with_namespace: string;
        web_url: string;
        description: string | null;
        visibility: string;
        default_branch: string;
        updated_at: string;
        star_count: number;
        forks_count: number;
        topics: string[];
      }>;

      return json({
        projects: projects.map((project) => ({
          id: project.id,
          name: project.name,
          path_with_namespace: project.path_with_namespace,
          web_url: project.web_url,
          description: project.description,
          visibility: project.visibility,
          default_branch: project.default_branch,
          updated_at: project.updated_at,
          star_count: project.star_count || 0,
          forks_count: project.forks_count || 0,
          topics: project.topics || [],
        })),
      });
    }

    if (action === 'get_branches') {
      if (!projectId) {
        return json({ error: 'Project ID is required' }, { status: 400 });
      }

      // Fetch project branches
      const response = await fetchWithTimeout(
        `${gitlabUrl}/api/v4/projects/${encodeURIComponent(String(projectId))}/repository/branches?per_page=100`,
        {
          headers: {
            Accept: 'application/json',
            'Private-Token': gitlabToken,
            'User-Agent': 'app',
          },
          timeoutMs: 15000,
        },
      );

      if (!response.ok) {
        throw new Error(`GitLab API error: ${response.status}`);
      }

      const branches = (await response.json()) as Array<{
        name: string;
        commit: {
          id: string;
          short_id: string;
        };
        protected: boolean;
        default: boolean;
      }>;

      return json({
        branches: branches.map((branch) => ({
          name: branch.name,
          commit: {
            sha: branch.commit.id,
            short_id: branch.commit.short_id,
          },
          protected: branch.protected,
          default: branch.default,
        })),
      });
    }

    if (action === 'get_token') {
      /*
       * SECURITY: Never expose raw tokens to the client.
       * Git authentication uses the token from server-side cookies directly.
       */
      return json({ error: 'Direct token access is not permitted' }, { status: 403 });
    }

    if (action === 'search_projects') {
      if (!searchQuery) {
        return json({ error: 'Search query is required' }, { status: 400 });
      }

      // Search projects using GitLab API
      const response = await fetchWithTimeout(
        `${gitlabUrl}/api/v4/projects?search=${encodeURIComponent(searchQuery)}&per_page=${perPage}&order_by=updated_at&sort=desc`,
        {
          headers: {
            Accept: 'application/json',
            'Private-Token': gitlabToken,
            'User-Agent': 'app',
          },
          timeoutMs: 15000,
        },
      );

      if (!response.ok) {
        throw new Error(`GitLab API error: ${response.status}`);
      }

      const projects = (await response.json()) as Array<{
        id: number;
        name: string;
        path_with_namespace: string;
        web_url: string;
        description: string | null;
        visibility: string;
        default_branch: string;
        updated_at: string;
        star_count: number;
        forks_count: number;
        topics: string[];
        namespace: {
          name: string;
          full_path: string;
        };
      }>;

      return json({
        projects: projects.map((project) => ({
          id: project.id,
          name: project.name,
          path_with_namespace: project.path_with_namespace,
          web_url: project.web_url,
          description: project.description,
          visibility: project.visibility,
          default_branch: project.default_branch,
          updated_at: project.updated_at,
          star_count: project.star_count || 0,
          forks_count: project.forks_count || 0,
          topics: project.topics || [],
          namespace: {
            name: project.namespace.name,
            full_path: project.namespace.full_path,
          },
        })),
      });
    }

    return json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    logger.error('Error in GitLab user action:', error);
    return json(
      {
        error: 'Failed to process GitLab request',
        details: 'An internal error occurred',
      },
      { status: 500 },
    );
  }
}

export const action = withSecurity(gitlabUserAction, {
  rateLimit: true,
  allowedMethods: ['POST'],
});
