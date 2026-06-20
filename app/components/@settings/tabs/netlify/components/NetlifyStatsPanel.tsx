import React from 'react';
import type { NetlifySite, NetlifyDeploy } from '~/types/netlify';

interface NetlifyStatsPanelProps {
  totalSites: number;
  totalDeploys: number;
  totalBuilds: number;
  sites: NetlifySite[];
  deploys: NetlifyDeploy[];
}

/**
 * Netlify Overview Dashboard, Deployment Analytics, and Site Health metrics.
 * Renders three visual panels summarizing high-level stats.
 */
export default function NetlifyStatsPanel({
  totalSites,
  totalDeploys,
  totalBuilds,
  sites,
  deploys,
}: NetlifyStatsPanelProps) {
  return (
    <div className="space-y-4">
      {/* Netlify Overview Dashboard */}
      <div className="mb-6 p-4 bg-ui-background-depth-1 rounded-lg border border-ui-borderColor">
        <h4 className="text-sm font-medium text-ui-textPrimary mb-3">Netlify Overview</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-ui-textPrimary">{totalSites}</div>
            <div className="text-xs text-ui-textSecondary">Total Sites</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-ui-textPrimary">{totalDeploys}</div>
            <div className="text-xs text-ui-textSecondary">Total Deployments</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-ui-textPrimary">{totalBuilds}</div>
            <div className="text-xs text-ui-textSecondary">Total Builds</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-ui-textPrimary">
              {sites.filter((site) => site.published_deploy?.state === 'ready').length}
            </div>
            <div className="text-xs text-ui-textSecondary">Live Sites</div>
          </div>
        </div>
      </div>

      {/* Advanced Analytics */}
      <DeploymentAnalytics deploys={deploys} sites={sites} />

      {/* Site Health Metrics */}
      <SiteHealthOverview sites={sites} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface DeploymentAnalyticsProps {
  deploys: NetlifyDeploy[];
  sites: NetlifySite[];
}

function DeploymentAnalytics({ deploys, sites }: DeploymentAnalyticsProps) {
  const successfulDeploys = deploys.filter((deploy) => deploy.state === 'ready').length;
  const failedDeploys = deploys.filter((deploy) => deploy.state === 'error').length;
  const successRate = deploys.length > 0 ? Math.round((successfulDeploys / deploys.length) * 100) : 0;

  const now = Date.now();
  const last24Hours = deploys.filter(
    (deploy) => now - new Date(deploy.created_at).getTime() < 24 * 60 * 60 * 1000,
  ).length;
  const last7Days = deploys.filter(
    (deploy) => now - new Date(deploy.created_at).getTime() < 7 * 24 * 60 * 60 * 1000,
  ).length;
  const activeSites = sites.filter((site) => {
    const lastDeploy = site.published_deploy?.published_at;
    return lastDeploy && now - new Date(lastDeploy).getTime() < 7 * 24 * 60 * 60 * 1000;
  }).length;

  return (
    <div className="mb-6 space-y-4">
      <h4 className="text-sm font-medium text-ui-textPrimary">Deployment Analytics</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-ui-background-depth-2 p-3 rounded-lg border border-ui-borderColor">
          <h6 className="text-xs font-medium text-ui-textPrimary flex items-center gap-2 mb-2">
            <div className="i-ph:chart-pie w-4 h-4 text-ui-item-contentAccent" />
            Success Rate
          </h6>
          <div className="space-y-1">
            {[
              { label: 'Success Rate', value: `${successRate}%` },
              { label: 'Successful', value: successfulDeploys },
              { label: 'Failed', value: failedDeploys },
            ].map((item, idx) => (
              <div key={idx} className="flex justify-between text-xs">
                <span className="text-ui-textSecondary">{item.label}:</span>
                <span className="text-ui-textPrimary font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-ui-background-depth-2 p-3 rounded-lg border border-ui-borderColor">
          <h6 className="text-xs font-medium text-ui-textPrimary flex items-center gap-2 mb-2">
            <div className="i-ph:clock w-4 h-4 text-ui-item-contentAccent" />
            Recent Activity
          </h6>
          <div className="space-y-1">
            {[
              { label: 'Last 24 hours', value: last24Hours },
              { label: 'Last 7 days', value: last7Days },
              { label: 'Active sites', value: activeSites },
            ].map((item, idx) => (
              <div key={idx} className="flex justify-between text-xs">
                <span className="text-ui-textSecondary">{item.label}:</span>
                <span className="text-ui-textPrimary font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const HEALTH_METRICS = [
  {
    label: 'Healthy',
    icon: 'i-ph:heart',
    color: 'text-green-500',
    bgColor: 'bg-green-100 dark:bg-green-900/20',
    textColor: 'text-green-800 dark:text-green-400',
    compute: (sites: NetlifySite[]) => sites.filter((s) => s.published_deploy?.state === 'ready' && s.ssl_url).length,
  },
  {
    label: 'SSL Enabled',
    icon: 'i-ph:lock',
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/20',
    textColor: 'text-blue-800 dark:text-blue-400',
    compute: (sites: NetlifySite[]) => sites.filter((s) => !!s.ssl_url).length,
  },
  {
    label: 'Custom Domain',
    icon: 'i-ph:globe',
    color: 'text-purple-500',
    bgColor: 'bg-purple-100 dark:bg-purple-900/20',
    textColor: 'text-purple-800 dark:text-purple-400',
    compute: (sites: NetlifySite[]) => sites.filter((s) => !!s.custom_domain).length,
  },
  {
    label: 'Building',
    icon: 'i-ph:gear',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
    textColor: 'text-yellow-800 dark:text-yellow-400',
    compute: (sites: NetlifySite[]) =>
      sites.filter((s) => s.published_deploy?.state === 'building' || s.published_deploy?.state === 'processing')
        .length,
  },
  {
    label: 'Needs Attention',
    icon: 'i-ph:warning',
    color: 'text-red-500',
    bgColor: 'bg-red-100 dark:bg-red-900/20',
    textColor: 'text-red-800 dark:text-red-400',
    compute: (sites: NetlifySite[]) =>
      sites.filter((s) => s.published_deploy?.state === 'error' || !s.published_deploy).length,
  },
] as const;

function SiteHealthOverview({ sites }: { sites: NetlifySite[] }) {
  return (
    <div className="mb-6">
      <h4 className="text-sm font-medium text-ui-textPrimary mb-2">Site Health Overview</h4>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {HEALTH_METRICS.map((metric) => (
          <div
            key={metric.label}
            className={`flex flex-col p-3 rounded-lg border border-ui-borderColor ${metric.bgColor}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className={`${metric.icon} w-4 h-4 ${metric.color}`} />
              <span className="text-xs text-ui-textSecondary">{metric.label}</span>
            </div>
            <span className={`text-lg font-medium ${metric.textColor}`}>{metric.compute(sites)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
