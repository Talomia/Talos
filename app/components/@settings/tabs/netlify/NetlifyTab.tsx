import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { useStore } from '@nanostores/react';
import { netlifyConnection } from '~/lib/stores/netlify';
import { Button } from '~/components/ui/Button';
import { fetchNetlifyUser } from '~/components/@settings/tabs/netlify/netlifyApi';
import { NetlifyConnection } from '~/components/@settings/tabs/netlify/components';
import NetlifyStatsPanel from '~/components/@settings/tabs/netlify/components/NetlifyStatsPanel';

// Netlify logo SVG component
const NetlifyLogo = () => (
  <svg viewBox="0 0 40 40" className="w-5 h-5">
    <path
      fill="currentColor"
      d="M28.589 14.135l-.014-.006c-.008-.003-.016-.006-.023-.013a.11.11 0 0 1-.028-.093l.773-4.726 3.625 3.626-3.77 1.604a.083.083 0 0 1-.033.006h-.015c-.005-.003-.01-.007-.02-.017a1.716 1.716 0 0 0-.495-.381zm5.258-.288l3.876 3.876c.805.806 1.208 1.208 1.674 1.355a2 2 0 0 1 1.206 0c.466-.148.869-.55 1.674-1.356L8.73 28.73l2.349-3.643c.011-.018.022-.034.04-.047.025-.018.061-.01.091 0a2.434 2.434 0 0 0 1.638-.083c.027-.01.054-.017.075.002a.19.19 0 0 1 .028.032L21.95 38.05zM7.863 27.863L5.8 25.8l4.074-1.738a.084.084 0 0 1 .033-.007c.034 0 .054.034.072.065a2.91 2.91 0 0 0 .13.184l.013.016c.012.017.004.034-.008.05l-2.25 3.493zm-2.976-2.976l-2.61-2.61c-.444-.444-.766-.766-.99-1.043l7.936 1.646a.84.84 0 0 0 .03.005c.049.008.103.017.103.063 0 .05-.059.073-.109.092l-.023.01-4.337 1.837zM.831 19.892a2 2 0 0 1 .09-.495c.148-.466.55-.868 1.356-1.674l3.34-3.34a2175.525 2175.525 0 0 0 4.626 6.687c.027.036.057.076.026.106-.146.161-.292.337-.395.528a.16.16 0 0 1-.05.062c-.013.008-.027.005-.042.002H9.78L.831 19.892zm5.68-6.403l4.491-4.491c.422.185 1.958.834 3.332 1.414 1.04.44 1.988.84 2.286.97.03.012.057.024.07.054.008.018.004.041 0 .06a2.003 2.003 0 0 0 .523 1.828c.03.03 0 .073-.026.11l-.014.021-4.56 7.063c-.012.02-.023.037-.043.05-.024.015-.058.008-.086.001a2.274 2.274 0 0 0-.543-.074c-.164 0-.342.03-.522.063h-.001c-.02.003-.038.007-.054-.005a.21.21 0 0 1-.045-.051l-4.808-7.013zm5.398-5.398l5.814-5.814c.805-.805 1.208-1.208 1.674-1.355a2 2 0 0 1 1.206 0c.466.147.869.55 1.674 1.355l1.26 1.26-4.135 6.404a.155.155 0 0 1-.041.048c-.025.017-.06.01-.09 0a2.097 2.097 0 0 0-1.92.37c-.027.028-.067.012-.101-.003-.54-.235-4.74-2.01-5.341-2.265zm12.506-3.676l3.818 3.818-.92 5.698v.015a.135.135 0 0 1-.008.038c-.01.02-.03.024-.05.03a1.83 1.83 0 0 0-.548.273.154.154 0 0 0-.02.017c-.011.012-.022.023-.04.025a.114.114 0 0 1-.043-.007l-5.818-2.472-.011-.005c-.037-.015-.081-.033-.081-.071a2.198 2.198 0 0 0-.31-.915c-.028-.046-.059-.094-.035-.141l4.066-6.303zm-3.932 8.606l5.454 2.31c.03.014.063.027.076.058a.106.106 0 0 1 0 .057c-.016.08-.03.171-.03.263v.153c0 .038-.039.054-.075.069l-.011.004c-.864.369-12.13 5.173-12.147 5.173-.017 0-.035 0-.052-.017-.03-.03 0-.072.027-.11a.76.76 0 0 0 .014-.02l4.482-6.94.008-.012c.026-.042.056-.089.104-.089l.045.007c.102.014.192.027.283.027.68 0 1.31-.331 1.69-.897a.16.16 0 0 1 .034-.04c.027-.02.067-.01.098.004zm-6.246 9.185l12.28-5.237s.018 0 .035.017c.067.067.124.112.179.154l.027.017c.025.014.05.03.052.056 0 .01 0 .016-.002.025L25.756 23.7l-.004.026c-.007.05-.014.107-.061.107a1.729 1.729 0 0 0-1.373.847l-.005.008c-.014.023-.027.045-.05.057-.021.01-.048.006-.07.001l-9.793-2.02c-.01-.002-.152-.519-.163-.52z"
    />
  </svg>
);

interface ConnectionTestResult {
  status: 'success' | 'error' | 'testing';
  message: string;
  timestamp?: number;
}

export default function NetlifyTab() {
  const connection = useStore(netlifyConnection);
  const [connectionTest, setConnectionTest] = useState<ConnectionTestResult | null>(null);

  // Connection testing function
  const testConnection = async () => {
    if (!connection.token) {
      setConnectionTest({
        status: 'error',
        message: 'No token provided',
        timestamp: Date.now(),
      });
      return;
    }

    setConnectionTest({
      status: 'testing',
      message: 'Testing connection...',
    });

    try {
      const data = await fetchNetlifyUser(connection.token);
      setConnectionTest({
        status: 'success',
        message: `Connected successfully as ${data.email}`,
        timestamp: Date.now(),
      });
    } catch (error) {
      setConnectionTest({
        status: 'error',
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between gap-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center gap-2">
          <div className="text-[#00AD9F]">
            <NetlifyLogo />
          </div>
          <h2 className="text-lg font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
            Netlify Integration
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {connection.user && (
            <Button
              onClick={testConnection}
              disabled={connectionTest?.status === 'testing'}
              variant="outline"
              className="flex items-center gap-2 hover:bg-bolt-elements-item-backgroundActive/10 hover:text-bolt-elements-textPrimary dark:hover:bg-bolt-elements-item-backgroundActive/10 dark:hover:text-bolt-elements-textPrimary transition-colors"
            >
              {connectionTest?.status === 'testing' ? (
                <>
                  <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <div className="i-ph:plug-charging w-4 h-4" />
                  Test Connection
                </>
              )}
            </Button>
          )}
        </div>
      </motion.div>

      <p className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
        Connect and manage your Netlify sites with advanced deployment controls and site management
      </p>

      {/* Connection Test Results */}
      {connectionTest && (
        <motion.div
          className={classNames('p-4 rounded-lg border', {
            'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700':
              connectionTest.status === 'success',
            'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700': connectionTest.status === 'error',
            'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700': connectionTest.status === 'testing',
          })}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-2">
            {connectionTest.status === 'success' && (
              <div className="i-ph:check-circle w-5 h-5 text-green-600 dark:text-green-400" />
            )}
            {connectionTest.status === 'error' && (
              <div className="i-ph:warning-circle w-5 h-5 text-red-600 dark:text-red-400" />
            )}
            {connectionTest.status === 'testing' && (
              <div className="i-ph:spinner-gap w-5 h-5 animate-spin text-blue-600 dark:text-blue-400" />
            )}
            <span
              className={classNames('text-sm font-medium', {
                'text-green-800 dark:text-green-200': connectionTest.status === 'success',
                'text-red-800 dark:text-red-200': connectionTest.status === 'error',
                'text-blue-800 dark:text-blue-200': connectionTest.status === 'testing',
              })}
            >
              {connectionTest.message}
            </span>
          </div>
          {connectionTest.timestamp && (
            <p className="text-xs text-gray-500 mt-1">{new Date(connectionTest.timestamp).toLocaleString()}</p>
          )}
        </motion.div>
      )}

      {/* Overview Dashboard — only visible when connected with stats */}
      {connection.user && connection.stats && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <NetlifyStatsPanel
            totalSites={connection.stats.totalSites}
            totalDeploys={connection.stats.totalDeploys ?? 0}
            totalBuilds={connection.stats.totalBuilds ?? 0}
            sites={connection.stats.sites}
            deploys={connection.stats.deploys ?? []}
          />
        </motion.div>
      )}

      {/* Main Connection Component — handles token input, connect/disconnect, site/deploy/build lists */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <NetlifyConnection />
      </motion.div>
    </div>
  );
}
