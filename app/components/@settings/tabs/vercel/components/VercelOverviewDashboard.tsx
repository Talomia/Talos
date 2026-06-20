import type { VercelStats } from '~/types/vercel';

interface VercelOverviewDashboardProps {
  stats: VercelStats;
}

export function VercelOverviewDashboard({ stats }: VercelOverviewDashboardProps) {
  const deployedProjects = stats.projects.filter(
    (p) => p.targets?.production?.alias && p.targets.production.alias.length > 0,
  ).length;

  const frameworksUsed = new Set(stats.projects.map((p) => p.framework).filter(Boolean)).size;

  const activeDeployments = stats.projects.filter((p) => p.latestDeployments?.[0]?.state === 'READY').length;

  return (
    <div className="mb-6 p-4 bg-ui-background-depth-1 rounded-lg border border-ui-borderColor">
      <h4 className="text-sm font-medium text-ui-textPrimary mb-3">Vercel Overview</h4>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-ui-textPrimary">{stats.totalProjects}</div>
          <div className="text-xs text-ui-textSecondary">Total Projects</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-ui-textPrimary">{deployedProjects}</div>
          <div className="text-xs text-ui-textSecondary">Deployed Projects</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-ui-textPrimary">{frameworksUsed}</div>
          <div className="text-xs text-ui-textSecondary">Frameworks Used</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-ui-textPrimary">{activeDeployments}</div>
          <div className="text-xs text-ui-textSecondary">Active Deployments</div>
        </div>
      </div>
    </div>
  );
}
