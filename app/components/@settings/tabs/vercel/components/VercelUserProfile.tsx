import type { VercelUser, VercelStats } from '~/types/vercel';

interface VercelUserProfileProps {
  user: VercelUser;
  stats?: VercelStats;
}

export function VercelUserProfile({ user, stats }: VercelUserProfileProps) {
  const activeProjects = stats?.projects.filter((p) => p.latestDeployments?.[0]?.state === 'READY').length || 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 p-4 bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-1 rounded-lg">
        <img
          src={`https://vercel.com/api/www/avatar?u=${user?.username}`}
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          alt="User Avatar"
          className="w-12 h-12 rounded-full border-2 border-bolt-elements-borderColorActive"
        />
        <div className="flex-1">
          <h4 className="text-sm font-medium text-bolt-elements-textPrimary">{user?.username || 'Vercel User'}</h4>
          <p className="text-sm text-bolt-elements-textSecondary">{user?.email || 'No email available'}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-bolt-elements-textSecondary">
            <span className="flex items-center gap-1">
              <div className="i-ph:buildings w-3 h-3" />
              {stats?.totalProjects || 0} Projects
            </span>
            <span className="flex items-center gap-1">
              <div className="i-ph:check-circle w-3 h-3" />
              {activeProjects} Live
            </span>
            <span className="flex items-center gap-1">
              <div className="i-ph:users w-3 h-3" />
              {/* Team size would be fetched from API */}
              --
            </span>
          </div>
        </div>
      </div>

      {/* Usage Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-3 bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor">
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:buildings w-4 h-4 text-bolt-elements-item-contentAccent" />
            <span className="text-xs font-medium text-bolt-elements-textPrimary">Projects</span>
          </div>
          <div className="text-sm text-bolt-elements-textSecondary">
            <div>Active: {activeProjects}</div>
            <div>Total: {stats?.totalProjects || 0}</div>
          </div>
        </div>
        <div className="p-3 bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor">
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:globe w-4 h-4 text-bolt-elements-item-contentAccent" />
            <span className="text-xs font-medium text-bolt-elements-textPrimary">Domains</span>
          </div>
          <div className="text-sm text-bolt-elements-textSecondary">
            {/* Domain usage would be fetched from API */}
            <div>Custom: --</div>
            <div>Vercel: --</div>
          </div>
        </div>
        <div className="p-3 bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor">
          <div className="flex items-center gap-2 mb-2">
            <div className="i-ph:activity w-4 h-4 text-bolt-elements-item-contentAccent" />
            <span className="text-xs font-medium text-bolt-elements-textPrimary">Usage</span>
          </div>
          <div className="text-sm text-bolt-elements-textSecondary">
            {/* Usage metrics would be fetched from API */}
            <div>Bandwidth: --</div>
            <div>Requests: --</div>
          </div>
        </div>
      </div>
    </div>
  );
}
