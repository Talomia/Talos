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
      /*
       * Validate authentication via Supabase auth cookie.
       * The cookie name follows the pattern: sb-<project-ref>-auth-token
       */
      const authCookie = request.headers.get('Cookie') || '';

      // Extract the Supabase project reference from the configured URL
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
      const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase/)?.[1];

      // Look for a Supabase auth token cookie with proper JWT structure
      const cookiePattern = projectRef
        ? new RegExp(`sb-${projectRef}-auth-token=([^;]+)`)
        : /sb-[a-z]+-auth-token=([^;]+)/;

      const tokenMatch = authCookie.match(cookiePattern);

      if (!tokenMatch) {
        return json({ error: 'Authentication required' }, { status: 401 });
      }

      // Validate basic JWT structure (3 base64url dot-separated parts)
      const tokenValue = decodeURIComponent(tokenMatch[1]);

      /*
       * Supabase stores an array: ["access_token", "refresh_token"]
       * or a direct JWT string
       */
      let jwtToValidate: string | undefined;

      try {
        jwtToValidate = tokenValue.startsWith('[') ? JSON.parse(tokenValue)?.[0] : tokenValue;
      } catch {
        return json({ error: 'Invalid authentication token' }, { status: 401 });
      }

      if (!jwtToValidate || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwtToValidate)) {
        return json({ error: 'Invalid authentication token' }, { status: 401 });
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
    } catch {
      githubApiStatus = {
        isReachable: false,
        error: 'An internal error occurred',
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
    } catch {
      netlifyApiStatus = {
        isReachable: false,
        error: 'An internal error occurred',
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
