import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import {
  supabaseConnection,
  isConnecting,
  isFetchingStats,
  isFetchingApiKeys,
  updateSupabaseConnection,
  fetchSupabaseStats,
  fetchProjectApiKeys,
  initializeSupabaseConnection,
} from '~/lib/stores/supabase';
import { ServiceHeader, ConnectionTestIndicator } from '~/components/@settings/shared/service-integration';
import type { ConnectionTestResult } from '~/components/@settings/shared/service-integration';
import { SupabaseUserProfile } from './components/SupabaseUserProfile';
import { SupabaseAnalytics } from './components/SupabaseAnalytics';
import { SupabaseProjectList } from './components/SupabaseProjectList';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SupabaseTab');

// Supabase logo SVG component
const SupabaseLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 109 113" className={classNames('w-5 h-5', className)}>
    <path
      fill="currentColor"
      d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627L99.1935 40.0627C107.384 40.0627 111.952 49.5228 106.859 55.9374L63.7076 110.284Z"
    />
    <path
      fillOpacity="0.2"
      fill="currentColor"
      d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627L99.1935 40.0627C107.384 40.0627 111.952 49.5228 106.859 55.9374L63.7076 110.284Z"
    />
    <path
      fill="currentColor"
      d="M45.317 2.07103C48.1765 -1.53037 53.9745 0.442937 54.0434 5.041L54.4849 72.2922H9.83113C1.64038 72.2922 -2.92775 62.8321 2.1655 56.4175L45.317 2.07103Z"
    />
  </svg>
);

export default function SupabaseTab() {
  const connection = useStore(supabaseConnection);
  const connecting = useStore(isConnecting);
  const fetchingStats = useStore(isFetchingStats);
  const fetchingApiKeys = useStore(isFetchingApiKeys);

  const [tokenInput, setTokenInput] = useState('');
  const [connectionTest, setConnectionTest] = useState<ConnectionTestResult | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Connection testing function - uses server-side API to test environment token
  const testConnection = async () => {
    setConnectionTest({
      status: 'testing',
      message: 'Testing connection...',
    });

    try {
      const response = await fetch('/api/supabase-user', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = (await response.json()) as { projects?: unknown[] };
        setConnectionTest({
          status: 'success',
          message: `Connected successfully using environment token. Found ${data.projects?.length || 0} projects`,
          timestamp: Date.now(),
        });
      } else {
        const errorData = (await response.json().catch(() => ({}))) as { error?: string };
        setConnectionTest({
          status: 'error',
          message: `Connection failed: ${errorData.error || `${response.status} ${response.statusText}`}`,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      setConnectionTest({
        status: 'error',
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    }
  };

  // Initialize connection on component mount - check server-side token first
  useEffect(() => {
    const initializeConnection = async () => {
      try {
        // First try to initialize using server-side token
        await initializeSupabaseConnection();

        // If no connection was established, the user will need to manually enter a token
        const currentState = supabaseConnection.get();

        if (!currentState.user) {
          logger.debug('No server-side Supabase token available, manual connection required');
        }
      } catch (error) {
        logger.error('Failed to initialize Supabase connection:', error);
      }
    };
    initializeConnection();
  }, []);

  useEffect(() => {
    const fetchProjects = async () => {
      if (connection.user && connection.token && !connection.stats) {
        await fetchSupabaseStats(connection.token);
      }
    };
    fetchProjects();
  }, [connection.user, connection.token]);

  const handleConnect = async () => {
    if (!tokenInput) {
      toast.error('Please enter a Supabase access token');
      return;
    }

    isConnecting.set(true);

    try {
      await fetchSupabaseStats(tokenInput);
      updateSupabaseConnection({
        token: tokenInput,
        isConnected: true,
      });
      toast.success('Successfully connected to Supabase');
      setTokenInput('');
    } catch (error) {
      logger.error('Auth error:', error);
      toast.error('Failed to connect to Supabase');
      updateSupabaseConnection({ user: null, token: '' });
    } finally {
      isConnecting.set(false);
    }
  };

  const handleDisconnect = () => {
    updateSupabaseConnection({
      user: null,
      token: '',
      stats: undefined,
      selectedProjectId: undefined,
      isConnected: false,
      project: undefined,
      credentials: undefined,
    });
    setConnectionTest(null);
    setSelectedProjectId('');
    toast.success('Disconnected from Supabase');
  };

  const handleProjectSelect = async (projectId: string) => {
    setSelectedProjectId(projectId);
    updateSupabaseConnection({ selectedProjectId: projectId });

    if (projectId && connection.token) {
      try {
        await fetchProjectApiKeys(projectId, connection.token);
      } catch (error) {
        logger.error('Failed to fetch API keys:', error);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header — uses shared ServiceHeader */}
      <ServiceHeader
        icon={({ className }) => (
          <div className="text-[#3ECF8E]">
            <SupabaseLogo className={className} />
          </div>
        )}
        title="Supabase Integration"
        description="Connect and manage your Supabase projects with database access, authentication, and storage controls"
        onTestConnection={connection.user ? testConnection : undefined}
        isTestingConnection={connectionTest?.status === 'testing'}
      />

      {/* Connection Test Results — uses shared ConnectionTestIndicator */}
      <ConnectionTestIndicator testResult={connectionTest} />

      {/* Main Connection Component */}
      <motion.div
        className="bg-bolt-elements-background dark:bg-bolt-elements-background border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor rounded-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="p-6 space-y-6">
          {!connection.user ? (
            <div className="space-y-4">
              <div className="text-xs text-bolt-elements-textSecondary bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-1 p-3 rounded-lg mb-4">
                <p className="flex items-center gap-1 mb-1">
                  <span className="i-ph:lightbulb w-3.5 h-3.5 text-bolt-elements-icon-success dark:text-bolt-elements-icon-success" />
                  <span className="font-medium">Tip:</span> You can also set the{' '}
                  <code className="px-1 py-0.5 bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-2 rounded">
                    VITE_SUPABASE_ACCESS_TOKEN
                  </code>{' '}
                  environment variable to connect automatically.
                </p>
              </div>

              <div>
                <label className="block text-sm text-bolt-elements-textSecondary mb-2">Access Token</label>
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  disabled={connecting}
                  placeholder="Enter your Supabase access token"
                  className={classNames(
                    'w-full px-3 py-2 rounded-lg text-sm',
                    'bg-[#F8F8F8] dark:bg-[#1A1A1A]',
                    'border border-[#E5E5E5] dark:border-[#333333]',
                    'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                    'focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive',
                    'disabled:opacity-50',
                  )}
                />
                <div className="mt-2 text-sm text-bolt-elements-textSecondary">
                  <a
                    href="https://supabase.com/dashboard/account/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-bolt-elements-borderColorActive hover:underline inline-flex items-center gap-1"
                  >
                    Get your token
                    <div className="i-ph:arrow-square-out w-4 h-4" />
                  </a>
                </div>
              </div>

              <button
                onClick={handleConnect}
                disabled={connecting || !tokenInput}
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
                  <span className="text-sm text-bolt-elements-textSecondary flex items-center gap-1">
                    <div className="i-ph:check-circle w-4 h-4 text-green-500" />
                    Connected to Supabase
                  </span>
                </div>
              </div>

              {connection.user && (
                <div className="space-y-4">
                  <SupabaseUserProfile user={connection.user} stats={connection.stats} />
                  <SupabaseAnalytics stats={connection.stats} />
                </div>
              )}

              <SupabaseProjectList
                stats={connection.stats}
                token={connection.token}
                credentials={connection.credentials}
                selectedProjectId={selectedProjectId}
                fetchingStats={fetchingStats}
                fetchingApiKeys={fetchingApiKeys}
                onProjectSelect={handleProjectSelect}
              />
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
