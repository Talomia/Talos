import { useMemo } from 'react';
import type { VercelStats } from '~/types/vercel';

interface AnalyticsMetric {
  label: string;
  value: string | number;
}

interface VercelAnalyticsProps {
  stats: VercelStats;
}

export function VercelAnalytics({ stats }: VercelAnalyticsProps) {
  const deploymentHealth = useMemo((): AnalyticsMetric[] => {
    const totalDeployments = stats.projects.reduce((sum, p) => sum + (p.latestDeployments?.length || 0), 0);
    const readyDeployments = stats.projects.filter((p) => p.latestDeployments?.[0]?.state === 'READY').length;
    const errorDeployments = stats.projects.filter((p) => p.latestDeployments?.[0]?.state === 'ERROR').length;
    const successRate = totalDeployments > 0 ? Math.round((readyDeployments / stats.projects.length) * 100) : 0;

    return [
      { label: 'Success Rate', value: `${successRate}%` },
      { label: 'Active', value: readyDeployments },
      { label: 'Failed', value: errorDeployments },
    ];
  }, [stats.projects]);

  const frameworkDistribution = useMemo((): AnalyticsMetric[] => {
    const frameworks = stats.projects.reduce(
      (acc, p) => {
        if (p.framework) {
          acc[p.framework] = (acc[p.framework] || 0) + 1;
        }

        return acc;
      },
      {} as Record<string, number>,
    );

    return Object.entries(frameworks)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([framework, count]) => ({ label: framework, value: count }));
  }, [stats.projects]);

  const activitySummary = useMemo((): AnalyticsMetric[] => {
    const now = Date.now();
    const recentDeployments = stats.projects.filter((p) => {
      const lastDeploy = p.latestDeployments?.[0]?.created;
      return lastDeploy && now - new Date(lastDeploy).getTime() < 7 * 24 * 60 * 60 * 1000;
    }).length;
    const totalDomains = stats.projects.reduce(
      (sum, p) => sum + (p.targets?.production?.alias ? p.targets.production.alias.length : 0),
      0,
    );
    const avgDomainsPerProject =
      stats.projects.length > 0 ? Math.round((totalDomains / stats.projects.length) * 10) / 10 : 0;

    return [
      { label: 'Recent deploys', value: recentDeployments },
      { label: 'Total domains', value: totalDomains },
      { label: 'Avg domains/project', value: avgDomainsPerProject },
    ];
  }, [stats.projects]);

  return (
    <div className="mb-6 space-y-4">
      <h4 className="text-sm font-medium text-ui-textPrimary">Performance Analytics</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AnalyticsPanel icon="i-ph:rocket" title="Deployment Health" metrics={deploymentHealth} />
        <AnalyticsPanel icon="i-ph:chart-bar" title="Framework Distribution" metrics={frameworkDistribution} />
        <AnalyticsPanel icon="i-ph:activity" title="Activity Summary" metrics={activitySummary} />
      </div>
    </div>
  );
}

interface AnalyticsPanelProps {
  icon: string;
  title: string;
  metrics: AnalyticsMetric[];
}

function AnalyticsPanel({ icon, title, metrics }: AnalyticsPanelProps) {
  return (
    <div className="bg-ui-background-depth-2 p-3 rounded-lg border border-ui-borderColor">
      <h6 className="text-xs font-medium text-ui-textPrimary flex items-center gap-2 mb-2">
        <div className={`${icon} w-4 h-4 text-ui-item-contentAccent`} />
        {title}
      </h6>
      <div className="space-y-1">
        {metrics.map((item, idx) => (
          <div key={idx} className="flex justify-between text-xs">
            <span className="text-ui-textSecondary">{item.label}:</span>
            <span className="text-ui-textPrimary font-medium">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
