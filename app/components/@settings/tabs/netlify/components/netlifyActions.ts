import { toast } from 'react-toastify';
import {
  fetchSiteDetails,
  triggerSiteBuild,
  purgeSiteCache,
  fetchSiteEnvVars,
  fetchSiteFunctions,
  fetchSiteTraffic,
  deleteSite,
  manageDeploy,
} from '~/components/@settings/tabs/netlify/netlifyApi';

/** Describes a button action that can be performed on a Netlify site. */
export interface SiteAction {
  name: string;
  icon: string;
  action: (siteId: string) => Promise<void>;
  requiresConfirmation?: boolean;
  variant?: 'default' | 'destructive' | 'outline';
}

/**
 * Build the list of site actions.
 * `token` is the current Netlify API token.
 * `onRefresh` is called after mutations that require the stats to be re-fetched.
 */
export function buildSiteActions(token: string, onRefresh: () => void): SiteAction[] {
  return [
    {
      name: 'Clear Cache',
      icon: 'i-ph:arrows-clockwise',
      action: async (siteId: string) => {
        try {
          const siteData = await fetchSiteDetails(token, siteId).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);

            if (msg.includes('404') || msg.includes('not found')) {
              toast.error('Site not found. This may be a free account limitation.');
              return null;
            }

            throw err;
          });

          if (!siteData) {
            return;
          }

          const isFreeAccount = !siteData.plan || siteData.plan === 'free' || siteData.plan === 'starter';

          // If site has a repo, try triggering a build with cache clear
          if (siteData.build_settings && siteData.build_settings.repo_url) {
            try {
              /*
               * The API module's triggerSiteBuild doesn't support clear_cache,
               * so we need a direct call here.
               */
              const buildResponse = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/builds`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ clear_cache: true }),
              });

              if (buildResponse.ok) {
                toast.success('Build triggered with cache clear');
                return;
              } else if (buildResponse.status === 422) {
                toast.warning('Build trigger failed. This feature may not be available on free accounts.');
                return;
              }
            } catch {
              // fall through to cache purge
            }
          }

          // Fallback: standard cache purge
          try {
            await purgeSiteCache(token, siteId);
            toast.success('Site cache cleared successfully');
          } catch (purgeErr: unknown) {
            const msg = purgeErr instanceof Error ? purgeErr.message : String(purgeErr);

            if (isFreeAccount) {
              toast.warning('Cache purge not available on free accounts. Try triggering a build instead.');
            } else {
              toast.error(`Cache purge endpoint not found: ${msg}`);
            }
          }
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          toast.error(`Failed to clear site cache: ${error}`);
        }
      },
    },
    {
      name: 'Manage Environment',
      icon: 'i-ph:gear',
      action: async (siteId: string) => {
        try {
          const siteData = await fetchSiteDetails(token, siteId);
          const isFreeAccount = !siteData.plan || siteData.plan === 'free' || siteData.plan === 'starter';

          try {
            const envVars = await fetchSiteEnvVars(token, siteId);
            toast.success(`Environment variables loaded: ${envVars.length} variables`);
          } catch {
            if (isFreeAccount) {
              toast.info('Environment variables management is limited on free accounts');
            } else {
              toast.info('Site has no environment variables configured');
            }
          }
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          toast.error(`Failed to load environment variables: ${error}`);
        }
      },
    },
    {
      name: 'Trigger Build',
      icon: 'i-ph:rocket',
      action: async (siteId: string) => {
        try {
          const buildData = await triggerSiteBuild(token, siteId);
          toast.success(`Build triggered successfully! ID: ${buildData.id}`);
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          toast.error(`Failed to trigger build: ${error}`);
        }
      },
    },
    {
      name: 'View Functions',
      icon: 'i-ph:brackets-curly',
      action: async (siteId: string) => {
        try {
          const siteData = await fetchSiteDetails(token, siteId);
          const isFreeAccount = !siteData.plan || siteData.plan === 'free' || siteData.plan === 'starter';

          try {
            const functions = await fetchSiteFunctions(token, siteId);
            toast.success(`Site has ${functions.length} serverless functions`);
          } catch {
            if (isFreeAccount) {
              toast.info('Functions may be limited or unavailable on free accounts');
            } else {
              toast.info('Site has no serverless functions');
            }
          }
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          toast.error(`Failed to load functions: ${error}`);
        }
      },
    },
    {
      name: 'Site Analytics',
      icon: 'i-ph:chart-bar',
      action: async (siteId: string) => {
        try {
          const siteData = await fetchSiteDetails(token, siteId);
          const isFreeAccount = !siteData.plan || siteData.plan === 'free' || siteData.plan === 'starter';

          try {
            await fetchSiteTraffic(token, siteId);
            toast.success('Site analytics loaded successfully');
          } catch {
            if (isFreeAccount) {
              toast.info('Analytics not available on free accounts. Showing basic site info instead.');
            }

            toast.info(`Site: ${siteData.name} - Status: ${siteData.state || 'Unknown'}`);
          }
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          toast.error(`Failed to load site analytics: ${error}`);
        }
      },
    },
    {
      name: 'Delete Site',
      icon: 'i-ph:trash',
      action: async (siteId: string) => {
        try {
          await deleteSite(token, siteId);
          toast.success('Site deleted successfully');
          onRefresh();
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          toast.error(`Failed to delete site: ${error}`);
        }
      },
      requiresConfirmation: true,
      variant: 'destructive',
    },
  ];
}

/**
 * Handle a deploy action (publish / lock / unlock).
 */
export async function handleDeployAction(
  token: string,
  siteId: string,
  deployId: string,
  action: 'lock' | 'unlock' | 'publish',
  onRefresh: () => void,
): Promise<void> {
  try {
    await manageDeploy(token, siteId, deployId, action);
    toast.success(`Deploy ${action}ed successfully`);
    onRefresh();
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    toast.error(`Failed to ${action} deploy: ${error}`);
  }
}
