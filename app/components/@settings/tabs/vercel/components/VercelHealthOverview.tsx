import { useMemo } from 'react';
import type { VercelStats } from '~/types/vercel';

interface HealthMetric {
  label: string;
  value: number;
  icon: string;
  color: string;
  bgColor: string;
  textColor: string;
}

interface VercelHealthOverviewProps {
  stats: VercelStats;
}

export function VercelHealthOverview({ stats }: VercelHealthOverviewProps) {
  const healthMetrics = useMemo((): HealthMetric[] => {
    const healthyProjects = stats.projects.filter(
      (p) => p.latestDeployments?.[0]?.state === 'READY' && (p.targets?.production?.alias?.length ?? 0) > 0,
    ).length;
    const needsAttention = stats.projects.filter(
      (p) => p.latestDeployments?.[0]?.state === 'ERROR' || p.latestDeployments?.[0]?.state === 'CANCELED',
    ).length;
    const withCustomDomain = stats.projects.filter((p) =>
      p.targets?.production?.alias?.some((alias: string) => !alias.includes('.vercel.app')),
    ).length;
    const buildingProjects = stats.projects.filter((p) => p.latestDeployments?.[0]?.state === 'BUILDING').length;

    return [
      {
        label: 'Healthy',
        value: healthyProjects,
        icon: 'i-ph:check-circle',
        color: 'text-green-500',
        bgColor: 'bg-green-100 dark:bg-green-900/20',
        textColor: 'text-green-800 dark:text-green-400',
      },
      {
        label: 'Custom Domain',
        value: withCustomDomain,
        icon: 'i-ph:globe',
        color: 'text-blue-500',
        bgColor: 'bg-blue-100 dark:bg-blue-900/20',
        textColor: 'text-blue-800 dark:text-blue-400',
      },
      {
        label: 'Building',
        value: buildingProjects,
        icon: 'i-ph:gear',
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-100 dark:bg-yellow-900/20',
        textColor: 'text-yellow-800 dark:text-yellow-400',
      },
      {
        label: 'Issues',
        value: needsAttention,
        icon: 'i-ph:warning',
        color: 'text-red-500',
        bgColor: 'bg-red-100 dark:bg-red-900/20',
        textColor: 'text-red-800 dark:text-red-400',
      },
    ];
  }, [stats.projects]);

  return (
    <div className="mb-6">
      <h4 className="text-sm font-medium text-ui-textPrimary mb-2">Project Health Overview</h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {healthMetrics.map((metric, index) => (
          <div key={index} className={`flex flex-col p-3 rounded-lg border border-ui-borderColor ${metric.bgColor}`}>
            <div className="flex items-center gap-2 mb-1">
              <div className={`${metric.icon} w-4 h-4 ${metric.color}`} />
              <span className="text-xs text-ui-textSecondary">{metric.label}</span>
            </div>
            <span className={`text-lg font-medium ${metric.textColor}`}>{metric.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
