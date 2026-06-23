import { json } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import type { GitLabProjectInfo } from '~/types/GitLab';
import { fetchWithTimeout } from '~/utils/fetchWithTimeout';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.gitlab-projects');

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

interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  description: string;
  web_url: string;
  http_url_to_repo: string;
  star_count: number;
  forks_count: number;
  updated_at: string;
  default_branch: string;
  visibility: string;
}

async function gitlabProjectsLoader({ request }: { request: Request }) {
  try {
    const body: any = await request.json();
    const { token, gitlabUrl = 'https://gitlab.com' } = body;

    if (!token) {
      return json({ error: 'GitLab token is required' }, { status: 400 });
    }

    // Validate gitlabUrl to prevent SSRF
    const urlValidation = validateGitlabUrl(gitlabUrl);

    if (!urlValidation.valid) {
      return json({ error: `Invalid GitLab URL: ${urlValidation.error}` }, { status: 400 });
    }

    // Fetch user's projects from GitLab API
    const url = `${gitlabUrl}/api/v4/projects?membership=true&per_page=100&order_by=updated_at&sort=desc`;

    const response = await fetchWithTimeout(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'app',
      },
      timeoutMs: 15000,
    });

    if (!response.ok) {
      if (response.status === 401) {
        return json({ error: 'Invalid GitLab token' }, { status: 401 });
      }

      const errorText = await response.text().catch(() => 'Unknown error');
      logger.error('GitLab API error:', response.status, errorText);

      return json(
        {
          error: `GitLab API error: ${response.status}`,
        },
        { status: response.status },
      );
    }

    const projects: GitLabProject[] = await response.json();

    // Transform to our GitLabProjectInfo format
    const transformedProjects: GitLabProjectInfo[] = projects.map((project) => ({
      id: project.id,
      name: project.name,
      path_with_namespace: project.path_with_namespace,
      description: project.description || '',
      http_url_to_repo: project.http_url_to_repo,
      star_count: project.star_count,
      forks_count: project.forks_count,
      updated_at: project.updated_at,
      default_branch: project.default_branch,
      visibility: project.visibility,
    }));

    return json({
      projects: transformedProjects,
      total: transformedProjects.length,
    });
  } catch (error) {
    logger.error('Failed to fetch GitLab projects:', error);

    if (error instanceof Error) {
      if (error.message.includes('fetch')) {
        return json(
          {
            error: 'Failed to connect to GitLab. Please check your network connection.',
          },
          { status: 503 },
        );
      }

      return json(
        {
          error: `Failed to fetch projects: ${error.message}`,
        },
        { status: 500 },
      );
    }

    return json(
      {
        error: 'An unexpected error occurred while fetching projects',
      },
      { status: 500 },
    );
  }
}

export const action = withSecurity(gitlabProjectsLoader);
