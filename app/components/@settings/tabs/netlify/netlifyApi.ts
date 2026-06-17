import { createScopedLogger } from '~/utils/logger';
import type { NetlifySite, NetlifyDeploy, NetlifyBuild } from '~/types/netlify';

const logger = createScopedLogger('netlify-api');

const NETLIFY_API_BASE = 'https://api.netlify.com/api/v1';

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Fetch the authenticated Netlify user.
 */
export async function fetchNetlifyUser(token: string) {
  const response = await fetch(`${NETLIFY_API_BASE}/user`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Connection failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch all sites for the authenticated user.
 */
export async function fetchSites(token: string): Promise<NetlifySite[]> {
  const response = await fetch(`${NETLIFY_API_BASE}/sites`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sites: ${response.statusText}`);
  }

  return (await response.json()) as NetlifySite[];
}

/**
 * Fetch deploys for a specific site.
 */
export async function fetchSiteDeploys(token: string, siteId: string, perPage = 20): Promise<NetlifyDeploy[]> {
  const response = await fetch(`${NETLIFY_API_BASE}/sites/${siteId}/deploys?per_page=${perPage}`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    logger.error(`Failed to fetch deploys for site ${siteId}: ${response.statusText}`);
    return [];
  }

  return (await response.json()) as NetlifyDeploy[];
}

/**
 * Fetch builds for a specific site.
 */
export async function fetchSiteBuilds(token: string, siteId: string, perPage = 10): Promise<NetlifyBuild[]> {
  const response = await fetch(`${NETLIFY_API_BASE}/sites/${siteId}/builds?per_page=${perPage}`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    logger.error(`Failed to fetch builds for site ${siteId}: ${response.statusText}`);
    return [];
  }

  return (await response.json()) as NetlifyBuild[];
}

/**
 * Fetch a single site's details.
 */
export async function fetchSiteDetails(token: string, siteId: string): Promise<any> {
  const response = await fetch(`${NETLIFY_API_BASE}/sites/${siteId}`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch site details: ${errorText}`);
  }

  return response.json();
}

/**
 * Trigger a new build for a site.
 */
export async function triggerSiteBuild(token: string, siteId: string): Promise<any> {
  const response = await fetch(`${NETLIFY_API_BASE}/sites/${siteId}/builds`, {
    method: 'POST',
    headers: authHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Failed to trigger build: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Purge the CDN cache for a site.
 */
export async function purgeSiteCache(token: string, siteId: string): Promise<void> {
  const response = await fetch(`${NETLIFY_API_BASE}/sites/${siteId}/purge_cache`, {
    method: 'POST',
    headers: authHeaders(token),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to clear cache: ${errorText}`);
  }
}

/**
 * Fetch environment variables for a site.
 */
export async function fetchSiteEnvVars(token: string, siteId: string): Promise<any[]> {
  const response = await fetch(`${NETLIFY_API_BASE}/sites/${siteId}/env`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch environment variables: ${errorText}`);
  }

  return (await response.json()) as any[];
}

/**
 * Fetch functions deployed to a site.
 */
export async function fetchSiteFunctions(token: string, siteId: string): Promise<any[]> {
  const response = await fetch(`${NETLIFY_API_BASE}/sites/${siteId}/functions`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch functions: ${errorText}`);
  }

  return (await response.json()) as any[];
}

/**
 * Fetch traffic/analytics for a site.
 */
export async function fetchSiteTraffic(token: string, siteId: string): Promise<any> {
  const response = await fetch(`${NETLIFY_API_BASE}/sites/${siteId}/traffic`, {
    headers: authHeaders(token),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to load analytics: ${errorText}`);
  }

  return response.json();
}

/**
 * Delete a site.
 */
export async function deleteSite(token: string, siteId: string): Promise<void> {
  const response = await fetch(`${NETLIFY_API_BASE}/sites/${siteId}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });

  if (!response.ok) {
    throw new Error('Failed to delete site');
  }
}

/**
 * Manage a deploy (lock, unlock, or publish).
 */
export async function manageDeploy(
  token: string,
  siteId: string,
  deployId: string,
  action: 'lock' | 'unlock' | 'publish',
): Promise<void> {
  const endpoint =
    action === 'publish'
      ? `${NETLIFY_API_BASE}/sites/${siteId}/deploys/${deployId}/restore`
      : `${NETLIFY_API_BASE}/deploys/${deployId}/${action}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: authHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Failed to ${action} deploy`);
  }
}

export interface NetlifyStatsData {
  sites: NetlifySite[];
  deploys: NetlifyDeploy[];
  builds: NetlifyBuild[];
  lastDeployTime: string;
  totalSites: number;
  totalDeploys: number;
  totalBuilds: number;
}

/**
 * Fetch all stats (sites, deploys, builds) in batches.
 */
export async function fetchAllStats(token: string): Promise<NetlifyStatsData> {
  const sites = await fetchSites(token);

  const allDeploys: NetlifyDeploy[] = [];
  const allBuilds: NetlifyBuild[] = [];
  let totalDeployCount = 0;

  if (sites.length > 0) {
    const batchSize = 3;

    for (let i = 0; i < sites.length; i += batchSize) {
      const batch = sites.slice(i, i + batchSize);

      const results = await Promise.all(
        batch.map(async (site) => {
          try {
            const [deploys, builds] = await Promise.all([
              fetchSiteDeploys(token, site.id),
              fetchSiteBuilds(token, site.id),
            ]);

            return { deploys, builds };
          } catch (error) {
            logger.error(`Failed to fetch data for site ${site.name}:`, error);
            return { deploys: [], builds: [] };
          }
        }),
      );

      for (const result of results) {
        allDeploys.push(...result.deploys);
        allBuilds.push(...result.builds);
        totalDeployCount += result.deploys.length;
      }

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < sites.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    // Sort deploys by creation date (newest first)
    allDeploys.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  return {
    sites,
    deploys: allDeploys,
    builds: allBuilds,
    lastDeployTime: allDeploys[0]?.created_at || '',
    totalSites: sites.length,
    totalDeploys: totalDeployCount,
    totalBuilds: allBuilds.length,
  };
}
