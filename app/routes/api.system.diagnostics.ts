import { json, type LoaderFunction, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { fetchWithTimeout } from '~/utils/fetchWithTimeout';

/**
 * Diagnostic API for troubleshooting connection issues
 */

interface AppContext {
  env?: {
    GITHUB_ACCESS_TOKEN?: string;
    NETLIFY_TOKEN?: string;
  };
}

export const loader: LoaderFunction = withSecurity(
  async ({ request, context }: LoaderFunctionArgs & { context: AppContext }) => {
    if (process.env.NODE_ENV === 'production') {
      // In production, require authentication
      const authCookie = request.headers.get('Cookie');
      if (!authCookie || !authCookie.includes('sb-')) {
        return json({ error: 'Authentication required' }, { status: 401 });
      }
    }

    // Get environment variables
    const envVars = {
      hasGithubToken: Boolean(process.env.GITHUB_ACCESS_TOKEN || context?.cloudflare?.env?.GITHUB_ACCESS_TOKEN),
      hasNetlifyToken: Boolean(process.env.NETLIFY_TOKEN || context?.cloudflare?.env?.NETLIFY_TOKEN),
      nodeEnv: process.env.NODE_ENV,
    };

    // Check cookies
    const cookieHeader = request.headers.get('Cookie') || '';
    const cookies = cookieHeader.split(';').reduce(
      (acc, cookie) => {
        const [key, value] = cookie.trim().split('=');

        if (key) {
          acc[key] = value;
        }

        return acc;
      },
      {} as Record<string, string>,
    );

    const hasGithubTokenCookie = Boolean(cookies.githubToken);
    const hasGithubUsernameCookie = Boolean(cookies.githubUsername);
    const hasNetlifyCookie = Boolean(cookies.netlifyToken);

    // Get local storage status (this can only be checked client-side)
    const localStorageStatus = {
      explanation: 'Local storage can only be checked on the client side. Use browser devtools to check.',
      githubKeysToCheck: ['github_connection'],
      netlifyKeysToCheck: ['netlify_connection'],
    };

    // Check if CORS might be an issue
    const corsStatus = {
      note: 'CORS is handled by the withSecurity wrapper',
    };

    // Check if API endpoints are reachable
    const apiEndpoints = {
      githubUser: '/api/system/git-info?action=getUser',
      githubRepos: '/api/system/git-info?action=getRepos',
      githubOrgs: '/api/system/git-info?action=getOrgs',
      githubActivity: '/api/system/git-info?action=getActivity',
      gitInfo: '/api/system/git-info',
    };

    // Test GitHub API connectivity
    let githubApiStatus;

    try {
      const githubResponse = await fetchWithTimeout('https://api.github.com/zen', {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
        timeoutMs: 10000,
      });

      githubApiStatus = {
        isReachable: githubResponse.ok,
        status: githubResponse.status,
        statusText: githubResponse.statusText,
      };
    } catch (error) {
      githubApiStatus = {
        isReachable: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Test Netlify API connectivity
    let netlifyApiStatus;

    try {
      const netlifyResponse = await fetchWithTimeout('https://api.netlify.com/api/v1/', {
        method: 'GET',
        timeoutMs: 10000,
      });

      netlifyApiStatus = {
        isReachable: netlifyResponse.ok,
        status: netlifyResponse.status,
        statusText: netlifyResponse.statusText,
      };
    } catch (error) {
      netlifyApiStatus = {
        isReachable: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    // Provide technical details about the environment
    const technicalDetails = {
      serverTimestamp: new Date().toISOString(),
      userAgent: request.headers.get('User-Agent'),
      referrer: request.headers.get('Referer'),
      host: request.headers.get('Host'),
      method: request.method,
      url: request.url,
    };

    // Return diagnostics
    return json({
      status: 'success',
      environment: envVars,
      cookies: {
        hasGithubTokenCookie,
        hasGithubUsernameCookie,
        hasNetlifyCookie,
      },
      localStorage: localStorageStatus,
      apiEndpoints,
      externalApis: {
        github: githubApiStatus,
        netlify: netlifyApiStatus,
      },
      corsStatus,
      technicalDetails,
    });
  },
);
