import type { SupabaseStats } from '~/types/supabase';

interface SupabaseAnalyticsProps {
  stats?: SupabaseStats;
}

export function SupabaseAnalytics({ stats }: SupabaseAnalyticsProps) {
  return (
    <>
      {/* Advanced Analytics */}
      <div className="mb-6 space-y-4">
        <h4 className="text-sm font-medium text-ui-textPrimary">Performance Analytics</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-ui-background-depth-2 p-3 rounded-lg border border-ui-borderColor">
            <h6 className="text-xs font-medium text-ui-textPrimary flex items-center gap-2 mb-2">
              <div className="i-ph:chart-line w-4 h-4 text-ui-item-contentAccent" />
              Database Health
            </h6>
            <div className="space-y-1">
              {(() => {
                const totalProjects = stats?.totalProjects || 0;
                const activeProjects = stats?.projects?.filter((p) => p.status === 'ACTIVE_HEALTHY').length || 0;
                const healthRate = totalProjects > 0 ? Math.round((activeProjects / totalProjects) * 100) : 0;
                const avgTablesPerProject =
                  totalProjects > 0
                    ? Math.round(
                        (stats?.projects?.reduce((sum, p) => sum + (p.stats?.database?.tables || 0), 0) || 0) /
                          totalProjects,
                      )
                    : 0;

                return [
                  { label: 'Health Rate', value: `${healthRate}%` },
                  { label: 'Active Projects', value: activeProjects },
                  { label: 'Avg Tables/Project', value: avgTablesPerProject },
                ];
              })().map((item, idx) => (
                <div key={idx} className="flex justify-between text-xs">
                  <span className="text-ui-textSecondary">{item.label}:</span>
                  <span className="text-ui-textPrimary font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-ui-background-depth-2 p-3 rounded-lg border border-ui-borderColor">
            <h6 className="text-xs font-medium text-ui-textPrimary flex items-center gap-2 mb-2">
              <div className="i-ph:shield-check w-4 h-4 text-ui-item-contentAccent" />
              Auth & Security
            </h6>
            <div className="space-y-1">
              {(() => {
                const totalProjects = stats?.totalProjects || 0;
                const projectsWithAuth = stats?.projects?.filter((p) => p.stats?.auth?.users !== undefined).length || 0;
                const authEnabledRate = totalProjects > 0 ? Math.round((projectsWithAuth / totalProjects) * 100) : 0;
                const totalUsers = stats?.projects?.reduce((sum, p) => sum + (p.stats?.auth?.users || 0), 0) || 0;

                return [
                  { label: 'Auth Enabled', value: `${authEnabledRate}%` },
                  { label: 'Total Users', value: totalUsers },
                  {
                    label: 'Avg Users/Project',
                    value: totalProjects > 0 ? Math.round(totalUsers / totalProjects) : 0,
                  },
                ];
              })().map((item, idx) => (
                <div key={idx} className="flex justify-between text-xs">
                  <span className="text-ui-textSecondary">{item.label}:</span>
                  <span className="text-ui-textPrimary font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-ui-background-depth-2 p-3 rounded-lg border border-ui-borderColor">
            <h6 className="text-xs font-medium text-ui-textPrimary flex items-center gap-2 mb-2">
              <div className="i-ph:globe w-4 h-4 text-ui-item-contentAccent" />
              Regional Distribution
            </h6>
            <div className="space-y-1">
              {(() => {
                const regions =
                  stats?.projects?.reduce(
                    (acc, p) => {
                      acc[p.region] = (acc[p.region] || 0) + 1;
                      return acc;
                    },
                    {} as Record<string, number>,
                  ) || {};

                return Object.entries(regions)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 3)
                  .map(([region, count]) => ({ label: region.toUpperCase(), value: count }));
              })().map((item, idx) => (
                <div key={idx} className="flex justify-between text-xs">
                  <span className="text-ui-textSecondary">{item.label}:</span>
                  <span className="text-ui-textPrimary font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Resource Utilization */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-ui-textPrimary mb-2">Resource Overview</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {(() => {
            const totalDatabase = stats?.projects?.reduce((sum, p) => sum + (p.stats?.database?.size_mb || 0), 0) || 0;
            const totalStorage = stats?.projects?.reduce((sum, p) => sum + (p.stats?.storage?.used_gb || 0), 0) || 0;
            const totalFunctions =
              stats?.projects?.reduce((sum, p) => sum + (p.stats?.functions?.deployed || 0), 0) || 0;
            const totalTables = stats?.projects?.reduce((sum, p) => sum + (p.stats?.database?.tables || 0), 0) || 0;
            const totalBuckets = stats?.projects?.reduce((sum, p) => sum + (p.stats?.storage?.buckets || 0), 0) || 0;

            return [
              {
                label: 'Database',
                value: totalDatabase > 0 ? `${totalDatabase} MB` : '--',
                icon: 'i-ph:database',
                color: 'text-blue-500',
                bgColor: 'bg-blue-100 dark:bg-blue-900/20',
                textColor: 'text-blue-800 dark:text-blue-400',
              },
              {
                label: 'Storage',
                value: totalStorage > 0 ? `${totalStorage} GB` : '--',
                icon: 'i-ph:folder',
                color: 'text-green-500',
                bgColor: 'bg-green-100 dark:bg-green-900/20',
                textColor: 'text-green-800 dark:text-green-400',
              },
              {
                label: 'Functions',
                value: totalFunctions,
                icon: 'i-ph:code',
                color: 'text-accent-500',
                bgColor: 'bg-accent-100 dark:bg-accent-900/20',
                textColor: 'text-accent-800 dark:text-accent-400',
              },
              {
                label: 'Tables',
                value: totalTables,
                icon: 'i-ph:table',
                color: 'text-orange-500',
                bgColor: 'bg-orange-100 dark:bg-orange-900/20',
                textColor: 'text-orange-800 dark:text-orange-400',
              },
              {
                label: 'Buckets',
                value: totalBuckets,
                icon: 'i-ph:archive',
                color: 'text-teal-500',
                bgColor: 'bg-teal-100 dark:bg-teal-900/20',
                textColor: 'text-teal-800 dark:text-teal-400',
              },
            ];
          })().map((metric, index) => (
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

      {/* Usage Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-3 bg-ui-background-depth-1 rounded-lg border border-ui-borderColor">
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:database w-4 h-4 text-ui-item-contentAccent" />
            <span className="text-xs font-medium text-ui-textPrimary">Database</span>
          </div>
          <div className="text-sm text-ui-textSecondary">
            <div>Tables: {stats?.projects?.reduce((sum, p) => sum + (p.stats?.database?.tables || 0), 0) || '--'}</div>
            <div>
              Size:{' '}
              {(() => {
                const totalSize = stats?.projects?.reduce((sum, p) => sum + (p.stats?.database?.size_mb || 0), 0) || 0;
                return totalSize > 0 ? `${totalSize} MB` : '--';
              })()}
            </div>
          </div>
        </div>
        <div className="p-3 bg-ui-background-depth-1 rounded-lg border border-ui-borderColor">
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:folder w-4 h-4 text-ui-item-contentAccent" />
            <span className="text-xs font-medium text-ui-textPrimary">Storage</span>
          </div>
          <div className="text-sm text-ui-textSecondary">
            <div>Buckets: {stats?.projects?.reduce((sum, p) => sum + (p.stats?.storage?.buckets || 0), 0) || '--'}</div>
            <div>
              Used:{' '}
              {(() => {
                const totalUsed = stats?.projects?.reduce((sum, p) => sum + (p.stats?.storage?.used_gb || 0), 0) || 0;
                return totalUsed > 0 ? `${totalUsed} GB` : '--';
              })()}
            </div>
          </div>
        </div>
        <div className="p-3 bg-ui-background-depth-1 rounded-lg border border-ui-borderColor">
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:code w-4 h-4 text-ui-item-contentAccent" />
            <span className="text-xs font-medium text-ui-textPrimary">Functions</span>
          </div>
          <div className="text-sm text-ui-textSecondary">
            <div>
              Deployed: {stats?.projects?.reduce((sum, p) => sum + (p.stats?.functions?.deployed || 0), 0) || '--'}
            </div>
            <div>
              Invocations:{' '}
              {stats?.projects?.reduce((sum, p) => sum + (p.stats?.functions?.invocations || 0), 0) || '--'}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
