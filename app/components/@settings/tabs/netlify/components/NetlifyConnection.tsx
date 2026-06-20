import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createScopedLogger } from '~/utils/logger';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { useStore } from '@nanostores/react';
import { netlifyConnection, updateNetlifyConnection, initializeNetlifyConnection } from '~/lib/stores/netlify';
import type { NetlifySite, NetlifyDeploy, NetlifyBuild, NetlifyUser } from '~/types/netlify';

import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '~/components/ui/Collapsible';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '~/components/ui/Badge';
import {
  fetchNetlifyUser,
  fetchSites,
  fetchSiteDeploys,
  fetchSiteBuilds,
} from '~/components/@settings/tabs/netlify/netlifyApi';
import { buildSiteActions, handleDeployAction } from './netlifyActions';
import NetlifySiteList from './NetlifySiteList';
import NetlifyDeployList from './NetlifyDeployList';
import NetlifyBuildList from './NetlifyBuildList';

// Add the Netlify logo SVG component at the top of the file
const NetlifyLogo = () => (
  <svg viewBox="0 0 40 40" className="w-5 h-5">
    <path
      fill="currentColor"
      d="M28.589 14.135l-.014-.006c-.008-.003-.016-.006-.023-.013a.11.11 0 0 1-.028-.093l.773-4.726 3.625 3.626-3.77 1.604a.083.083 0 0 1-.033.006h-.015c-.005-.003-.01-.007-.02-.017a1.716 1.716 0 0 0-.495-.381zm5.258-.288l3.876 3.876c.805.806 1.208 1.208 1.674 1.355a2 2 0 0 1 1.206 0c.466-.148.869-.55 1.674-1.356L8.73 28.73l2.349-3.643c.011-.018.022-.034.04-.047.025-.018.061-.01.091 0a2.434 2.434 0 0 0 1.638-.083c.027-.01.054-.017.075.002a.19.19 0 0 1 .028.032L21.95 38.05zM7.863 27.863L5.8 25.8l4.074-1.738a.084.084 0 0 1 .033-.007c.034 0 .054.034.072.065a2.91 2.91 0 0 0 .13.184l.013.016c.012.017.004.034-.008.05l-2.25 3.493zm-2.976-2.976l-2.61-2.61c-.444-.444-.766-.766-.99-1.043l7.936 1.646a.84.84 0 0 0 .03.005c.049.008.103.017.103.063 0 .05-.059.073-.109.092l-.023.01-4.337 1.837zM.831 19.892a2 2 0 0 1 .09-.495c.148-.466.55-.868 1.356-1.674l3.34-3.34a2175.525 2175.525 0 0 0 4.626 6.687c.027.036.057.076.026.106-.146.161-.292.337-.395.528a.16.16 0 0 1-.05.062c-.013.008-.027.005-.042.002H9.78L.831 19.892zm5.68-6.403l4.491-4.491c.422.185 1.958.834 3.332 1.414 1.04.44 1.988.84 2.286.97.03.012.057.024.07.054.008.018.004.041 0 .06a2.003 2.003 0 0 0 .523 1.828c.03.03 0 .073-.026.11l-.014.021-4.56 7.063c-.012.02-.023.037-.043.05-.024.015-.058.008-.086.001a2.274 2.274 0 0 0-.543-.074c-.164 0-.342.03-.522.063h-.001c-.02.003-.038.007-.054-.005a.21.21 0 0 1-.045-.051l-4.808-7.013zm5.398-5.398l5.814-5.814c.805-.805 1.208-1.208 1.674-1.355a2 2 0 0 1 1.206 0c.466.147.869.55 1.674 1.355l1.26 1.26-4.135 6.404a.155.155 0 0 1-.041.048c-.025.017-.06.01-.09 0a2.097 2.097 0 0 0-1.92.37c-.027.028-.067.012-.101-.003-.54-.235-4.74-2.01-5.341-2.265zm12.506-3.676l3.818 3.818-.92 5.698v.015a.135.135 0 0 1-.008.038c-.01.02-.03.024-.05.03a1.83 1.83 0 0 0-.548.273.154.154 0 0 0-.02.017c-.011.012-.022.023-.04.025a.114.114 0 0 1-.043-.007l-5.818-2.472-.011-.005c-.037-.015-.081-.033-.081-.071a2.198 2.198 0 0 0-.31-.915c-.028-.046-.059-.094-.035-.141l4.066-6.303zm-3.932 8.606l5.454 2.31c.03.014.063.027.076.058a.106.106 0 0 1 0 .057c-.016.08-.03.171-.03.263v.153c0 .038-.039.054-.075.069l-.011.004c-.864.369-12.13 5.173-12.147 5.173-.017 0-.035 0-.052-.017-.03-.03 0-.072.027-.11a.76.76 0 0 0 .014-.02l4.482-6.94.008-.012c.026-.042.056-.089.104-.089l.045.007c.102.014.192.027.283.027.68 0 1.31-.331 1.69-.897a.16.16 0 0 1 .034-.04c.027-.02.067-.01.098.004zm-6.246 9.185l12.28-5.237s.018 0 .035.017c.067.067.124.112.179.154l.027.017c.025.014.05.03.052.056 0 .01 0 .016-.002.025L25.756 23.7l-.004.026c-.007.05-.014.107-.061.107a1.729 1.729 0 0 0-1.373.847l-.005.008c-.014.023-.027.045-.05.057-.021.01-.048.006-.07.001l-9.793-2.02c-.01-.002-.152-.519-.163-.52z"
    />
  </svg>
);

const logger = createScopedLogger('NetlifyConnection');

export default function NetlifyConnection() {
  const connection = useStore(netlifyConnection);
  const [tokenInput, setTokenInput] = useState('');
  const [fetchingStats, setFetchingStats] = useState(false);
  const [sites, setSites] = useState<NetlifySite[]>([]);
  const [deploys, setDeploys] = useState<NetlifyDeploy[]>([]);
  const [builds, setBuilds] = useState<NetlifyBuild[]>([]);

  const [deploymentCount, setDeploymentCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState('');
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [activeSiteIndex, setActiveSiteIndex] = useState(0);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const fetchStats = useCallback(async (token: string) => {
    setFetchingStats(true);

    try {
      const sitesData = await fetchSites(token);
      setSites(sitesData);

      let deploysData: NetlifyDeploy[] = [];
      let buildsData: NetlifyBuild[] = [];
      let lastDeployTime = '';

      if (sitesData.length > 0) {
        const firstSite = sitesData[0];

        deploysData = await fetchSiteDeploys(token, firstSite.id);
        setDeploys(deploysData);
        setDeploymentCount(deploysData.length);

        if (deploysData.length > 0) {
          lastDeployTime = deploysData[0].created_at;
          setLastUpdated(lastDeployTime);

          buildsData = await fetchSiteBuilds(token, firstSite.id);
          setBuilds(buildsData);
        }
      }

      updateNetlifyConnection({
        stats: {
          sites: sitesData,
          deploys: deploysData,
          builds: buildsData,
          lastDeployTime,
          totalSites: sitesData.length,
        },
      });

      toast.success('Netlify stats updated');
    } catch (error) {
      logger.error('Error fetching Netlify stats:', error);
      toast.error(`Failed to fetch Netlify stats: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setFetchingStats(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    fetchStats(connection.token);
  }, [connection.token, fetchStats]);

  // Build site actions using the extracted module
  const siteActions = useMemo(
    () => buildSiteActions(connection.token, handleRefresh),
    [connection.token, handleRefresh],
  );

  const onDeployAction = useCallback(
    async (siteId: string, deployId: string, action: 'lock' | 'unlock' | 'publish') => {
      setIsActionLoading(true);
      await handleDeployAction(connection.token, siteId, deployId, action, handleRefresh);
      setIsActionLoading(false);
    },
    [connection.token, handleRefresh],
  );

  useEffect(() => {
    // Initialize connection with environment token if available
    initializeNetlifyConnection();
  }, []);

  useEffect(() => {
    // Check if we have a connection with a token but no stats
    if (connection.user && connection.token && (!connection.stats || !connection.stats.sites)) {
      fetchStats(connection.token);
    }

    // Update local state from connection
    if (connection.stats) {
      setSites(connection.stats.sites || []);
      setDeploys(connection.stats.deploys || []);
      setBuilds(connection.stats.builds || []);
      setDeploymentCount(connection.stats.deploys?.length || 0);
      setLastUpdated(connection.stats.lastDeployTime || '');
    }
  }, [connection, fetchStats]);

  const handleConnect = async () => {
    if (!tokenInput) {
      toast.error('Please enter a Netlify API token');
      return;
    }

    setIsConnecting(true);

    try {
      const userData: NetlifyUser = await fetchNetlifyUser(tokenInput);

      // Update the connection store
      updateNetlifyConnection({
        user: userData,
        token: tokenInput,
      });

      toast.success('Connected to Netlify successfully');

      // Fetch stats after successful connection
      fetchStats(tokenInput);
    } catch (error) {
      logger.error('Error connecting to Netlify:', error);
      toast.error(`Failed to connect to Netlify: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsConnecting(false);
      setTokenInput('');
    }
  };

  const handleDisconnect = () => {
    // Clear from localStorage
    localStorage.removeItem('netlify_connection');

    // Remove cookies
    document.cookie = 'netlifyToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';

    // Update the store
    updateNetlifyConnection({ user: null, token: '' });
    toast.success('Disconnected from Netlify');
  };

  return (
    <div className="space-y-6 bg-ui-background dark:bg-ui-background border border-ui-borderColor dark:border-ui-borderColor rounded-lg">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-[#00AD9F]">
              <NetlifyLogo />
            </div>
            <h2 className="text-lg font-medium text-ui-textPrimary">Netlify Connection</h2>
          </div>
        </div>

        {!connection.user ? (
          <div className="mt-4">
            <label className="block text-sm text-ui-textSecondary dark:text-ui-textSecondary mb-2">API Token</label>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Enter your Netlify API token"
              className={classNames(
                'w-full px-3 py-2 rounded-lg text-sm',
                'bg-[#F8F8F8] dark:bg-[#1A1A1A]',
                'border border-[#E5E5E5] dark:border-[#333333]',
                'text-ui-textPrimary placeholder-ui-textTertiary',
                'focus:outline-none focus:ring-1 focus:ring-ui-borderColorActive',
                'disabled:opacity-50',
              )}
            />
            <div className="mt-2 text-sm text-ui-textSecondary">
              <a
                href="https://app.netlify.com/user/applications#personal-access-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ui-borderColorActive hover:underline inline-flex items-center gap-1"
              >
                Get your token
                <div className="i-ph:arrow-square-out w-4 h-4" />
              </a>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleConnect}
                disabled={isConnecting || !tokenInput}
                className={classNames(
                  'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                  'bg-[#303030] text-white',
                  'hover:bg-[#5E41D0] hover:text-white',
                  'disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200',
                  'transform active:scale-95',
                )}
              >
                {isConnecting ? (
                  <>
                    <div className="i-ph:spinner-gap animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <div className="i-ph:plug-charging w-4 h-4" />
                    Connect
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col w-full gap-4 mt-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handleDisconnect}
                className={classNames(
                  'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                  'bg-red-500 text-white',
                  'hover:bg-red-600',
                )}
              >
                <div className="i-ph:plug w-4 h-4" />
                Disconnect
              </button>
              <span className="text-sm text-ui-textSecondary flex items-center gap-1">
                <div className="i-ph:check-circle w-4 h-4 text-green-500" />
                Connected to Netlify
              </span>
            </div>

            {/* Stats collapsible */}
            {connection.stats && (
              <div className="mt-6">
                <Collapsible open={isStatsOpen} onOpenChange={setIsStatsOpen}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 rounded-lg bg-ui-background dark:bg-ui-background-depth-2 border border-ui-borderColor dark:border-ui-borderColor hover:border-ui-borderColorActive/70 dark:hover:border-ui-borderColorActive/70 transition-all duration-200">
                      <div className="flex items-center gap-2">
                        <div className="i-ph:chart-bar w-4 h-4 text-ui-item-contentAccent dark:text-ui-item-contentAccent" />
                        <span className="text-sm font-medium text-ui-textPrimary dark:text-ui-textPrimary">
                          Netlify Stats
                        </span>
                      </div>
                      <div
                        className={classNames(
                          'i-ph:caret-down w-4 h-4 transform transition-transform duration-200 text-ui-textSecondary',
                          isStatsOpen ? 'rotate-180' : '',
                        )}
                      />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="overflow-hidden">
                    <div className="space-y-4 mt-4">
                      <div className="flex flex-wrap items-center gap-4">
                        <Badge
                          variant="outline"
                          className="flex items-center gap-1 text-ui-textPrimary dark:text-ui-textPrimary"
                        >
                          <div className="i-ph:buildings h-4 w-4 text-ui-item-contentAccent" />
                          <span>{connection.stats.totalSites} Sites</span>
                        </Badge>
                        <Badge
                          variant="outline"
                          className="flex items-center gap-1 text-ui-textPrimary dark:text-ui-textPrimary"
                        >
                          <div className="i-ph:rocket h-4 w-4 text-ui-item-contentAccent" />
                          <span>{deploymentCount} Deployments</span>
                        </Badge>
                        {lastUpdated && (
                          <Badge
                            variant="outline"
                            className="flex items-center gap-1 text-ui-textPrimary dark:text-ui-textPrimary"
                          >
                            <div className="i-ph:clock h-4 w-4 text-ui-item-contentAccent" />
                            <span>Updated {formatDistanceToNow(new Date(lastUpdated))} ago</span>
                          </Badge>
                        )}
                      </div>
                      {sites.length > 0 && (
                        <div className="mt-4 space-y-4">
                          <NetlifySiteList
                            sites={sites}
                            activeSiteIndex={activeSiteIndex}
                            onSelectSite={setActiveSiteIndex}
                            siteActions={siteActions}
                            isActionLoading={isActionLoading}
                            onActionLoadingChange={setIsActionLoading}
                            fetchingStats={fetchingStats}
                            onRefresh={handleRefresh}
                          />
                          {activeSiteIndex !== -1 && deploys.length > 0 && (
                            <NetlifyDeployList
                              deploys={deploys}
                              activeSiteId={sites[activeSiteIndex].id}
                              isActionLoading={isActionLoading}
                              onDeployAction={onDeployAction}
                            />
                          )}
                          {activeSiteIndex !== -1 && builds.length > 0 && <NetlifyBuildList builds={builds} />}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
