import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { logStore } from '~/lib/stores/logs';
import type { VercelUserResponse } from '~/types/vercel';
import { classNames } from '~/utils/classNames';
import { ServiceHeader, ConnectionTestIndicator } from '~/components/@settings/shared/service-integration';
import { useConnectionTest } from '~/lib/hooks';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '~/components/ui/Collapsible';
import { setSecureCookie, removeCookie } from '~/lib/api/secureCookies';
import { createScopedLogger } from '~/utils/logger';
import {
  vercelConnection,
  isConnecting,
  isFetchingStats,
  updateVercelConnection,
  fetchVercelStats,
  fetchVercelStatsViaAPI,
  initializeVercelConnection,
} from '~/lib/stores/vercel';
import {
  VercelOverviewDashboard,
  VercelAnalytics,
  VercelHealthOverview,
  VercelProjectList,
  VercelUserProfile,
  buildProjectActions,
} from './components';
import type { ProjectAction } from './components';

const logger = createScopedLogger('VercelTab');

// Vercel logo SVG component
const VercelLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path fill="currentColor" d="m12 2 10 18H2z" />
  </svg>
);

export default function VercelTab() {
  const connection = useStore(vercelConnection);
  const connecting = useStore(isConnecting);
  const fetchingStats = useStore(isFetchingStats);
  const [isProjectsExpanded, setIsProjectsExpanded] = useState(false);
  const [isProjectActionLoading, setIsProjectActionLoading] = useState(false);

  // Use shared connection test hook
  const {
    testResult: connectionTest,
    testConnection,
    isTestingConnection,
  } = useConnectionTest({
    testEndpoint: '/api/vercel-user',
    serviceName: 'Vercel',
    getUserIdentifier: (data: VercelUserResponse) =>
      data.username || data.user?.username || data.email || data.user?.email || 'Vercel User',
  });

  // Memoize project actions to prevent unnecessary re-renders
  const projectActions = useMemo(
    () =>
      buildProjectActions(
        connection.token,
        (projectId: string) => connection.stats?.projects.find((p) => p.id === projectId),
        connection.user?.username,
      ),
    [connection.token, connection.stats?.projects, connection.user?.username],
  );

  // Initialize connection on component mount - check server-side token first
  useEffect(() => {
    const initializeConnection = async () => {
      try {
        // First try to initialize using server-side token
        await initializeVercelConnection();

        // If no connection was established, the user will need to manually enter a token
        const currentState = vercelConnection.get();

        if (!currentState.user) {
          logger.debug('No server-side Vercel token available, manual connection required');
        }
      } catch (error) {
        logger.error('Failed to initialize Vercel connection:', error);
      }
    };
    initializeConnection();
  }, []);

  useEffect(() => {
    const fetchProjects = async () => {
      if (connection.user) {
        // Use server-side API if we have a connected user
        try {
          await fetchVercelStatsViaAPI(connection.token);
        } catch {
          // Fallback to direct API if server-side fails and we have a token
          if (connection.token) {
            await fetchVercelStats(connection.token);
          }
        }
      }
    };
    fetchProjects();
  }, [connection.user, connection.token]);

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    isConnecting.set(true);

    try {
      const token = connection.token;

      if (!token.trim()) {
        throw new Error('Token is required');
      }

      // First test the token directly with Vercel API
      const testResponse = await fetch('https://api.vercel.com/v2/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'app',
        },
      });

      if (!testResponse.ok) {
        if (testResponse.status === 401) {
          throw new Error('Invalid Vercel token');
        }

        throw new Error(`Vercel API error: ${testResponse.status}`);
      }

      const userData = (await testResponse.json()) as VercelUserResponse;

      // Set cookies for server-side API access
      setSecureCookie('VITE_VERCEL_ACCESS_TOKEN', token, { expires: 365 });

      // Normalize the user data structure
      const normalizedUser = userData.user || {
        id: userData.id || '',
        username: userData.username || '',
        email: userData.email || '',
        name: userData.name || '',
        avatar: userData.avatar,
      };

      updateVercelConnection({
        user: normalizedUser,
        token,
      });

      await fetchVercelStats(token);
      toast.success('Successfully connected to Vercel');
    } catch (error) {
      logger.error('Auth error:', error);
      logStore.logError('Failed to authenticate with Vercel', { error });

      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to Vercel';
      toast.error(errorMessage);
      updateVercelConnection({ user: null, token: '' });
    } finally {
      isConnecting.set(false);
    }
  };

  const handleDisconnect = () => {
    // Clear Vercel-related cookies
    removeCookie('VITE_VERCEL_ACCESS_TOKEN');

    updateVercelConnection({ user: null, token: '' });
    toast.success('Disconnected from Vercel');
  };

  const handleProjectAction = useCallback(async (projectId: string, action: ProjectAction) => {
    if (action.requiresConfirmation) {
      if (!confirm(`Are you sure you want to ${action.name.toLowerCase()}?`)) {
        return;
      }
    }

    setIsProjectActionLoading(true);
    await action.action(projectId);
    setIsProjectActionLoading(false);
  }, []);

  const hasProjects = !!connection.stats?.projects?.length;

  return (
    <div className="space-y-6">
      <ServiceHeader
        icon={VercelLogo}
        title="Vercel Integration"
        description="Connect and manage your Vercel projects with advanced deployment controls and analytics"
        onTestConnection={connection.user ? () => testConnection() : undefined}
        isTestingConnection={isTestingConnection}
      />

      <ConnectionTestIndicator testResult={connectionTest} />

      {/* Main Connection Component */}
      <motion.div
        className="bg-ui-background dark:bg-ui-background border border-ui-borderColor dark:border-ui-borderColor rounded-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="p-6 space-y-6">
          {!connection.user ? (
            <div className="space-y-4">
              <div className="text-xs text-ui-textSecondary bg-ui-background-depth-1 dark:bg-ui-background-depth-1 p-3 rounded-lg mb-4">
                <p className="flex items-center gap-1 mb-1">
                  <span className="i-ph:lightbulb w-3.5 h-3.5 text-ui-icon-success dark:text-ui-icon-success" />
                  <span className="font-medium">Tip:</span> You can also set the{' '}
                  <code className="px-1 py-0.5 bg-ui-background-depth-2 dark:bg-ui-background-depth-2 rounded">
                    VITE_VERCEL_ACCESS_TOKEN
                  </code>{' '}
                  environment variable to connect automatically.
                </p>
              </div>

              <div>
                <label className="block text-sm text-ui-textSecondary mb-2">Personal Access Token</label>
                <input
                  type="password"
                  value={connection.token}
                  onChange={(e) => updateVercelConnection({ ...connection, token: e.target.value })}
                  disabled={connecting}
                  placeholder="Enter your Vercel personal access token"
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
                    href="https://vercel.com/account/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-ui-borderColorActive hover:underline inline-flex items-center gap-1"
                  >
                    Get your token
                    <div className="i-ph:arrow-square-out w-4 h-4" />
                  </a>
                </div>
              </div>

              <button
                onClick={handleConnect}
                disabled={connecting || !connection.token}
                className={classNames(
                  'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                  'bg-[#303030] text-white',
                  'hover:bg-[#5E41D0] hover:text-white',
                  'disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200',
                  'transform active:scale-95',
                )}
              >
                {connecting ? (
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
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
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
                    Connected to Vercel
                  </span>
                </div>
              </div>

              <VercelUserProfile user={connection.user} stats={connection.stats} />

              {/* Projects Section */}
              {fetchingStats ? (
                <div className="flex items-center gap-2 text-sm text-ui-textSecondary">
                  <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
                  Fetching Vercel projects...
                </div>
              ) : (
                <Collapsible open={isProjectsExpanded} onOpenChange={setIsProjectsExpanded}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 rounded-lg bg-ui-background dark:bg-ui-background-depth-2 border border-ui-borderColor dark:border-ui-borderColor hover:border-ui-borderColorActive/70 dark:hover:border-ui-borderColorActive/70 transition-all duration-200 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <div className="i-ph:buildings w-4 h-4 text-ui-item-contentAccent" />
                        <span className="text-sm font-medium text-ui-textPrimary">
                          Your Projects ({connection.stats?.totalProjects || 0})
                        </span>
                      </div>
                      <div
                        className={classNames(
                          'i-ph:caret-down w-4 h-4 transform transition-transform duration-200 text-ui-textSecondary',
                          isProjectsExpanded ? 'rotate-180' : '',
                        )}
                      />
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="overflow-hidden">
                    <div className="space-y-4 mt-4">
                      {hasProjects && <VercelOverviewDashboard stats={connection.stats!} />}
                      {hasProjects && <VercelAnalytics stats={connection.stats!} />}
                      {hasProjects && <VercelHealthOverview stats={connection.stats!} />}
                      <VercelProjectList
                        projects={connection.stats?.projects || []}
                        projectActions={projectActions}
                        isProjectActionLoading={isProjectActionLoading}
                        onProjectAction={handleProjectAction}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
