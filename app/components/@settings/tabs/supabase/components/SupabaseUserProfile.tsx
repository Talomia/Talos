import type { SupabaseUser, SupabaseStats } from '~/types/supabase';

interface SupabaseUserProfileProps {
  user: SupabaseUser;
  stats?: SupabaseStats;
}

export function SupabaseUserProfile({ user, stats }: SupabaseUserProfileProps) {
  return (
    <div className="flex items-center gap-4 p-4 bg-ui-background-depth-1 dark:bg-ui-background-depth-1 rounded-lg">
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
        <div className="i-ph:user w-6 h-6 text-white" />
      </div>
      <div className="flex-1">
        <h4 className="text-sm font-medium text-ui-textPrimary">{user.email}</h4>
        <p className="text-sm text-ui-textSecondary">
          {user.role} • Member since {new Date(user.created_at).toLocaleDateString()}
        </p>
        <div className="flex items-center gap-4 mt-2 text-xs text-ui-textSecondary">
          <span className="flex items-center gap-1">
            <div className="i-ph:buildings w-3 h-3" />
            {stats?.totalProjects || 0} Projects
          </span>
          <span className="flex items-center gap-1">
            <div className="i-ph:globe w-3 h-3" />
            {new Set(stats?.projects?.map((p) => p.region) || []).size} Regions
          </span>
          <span className="flex items-center gap-1">
            <div className="i-ph:activity w-3 h-3" />
            {stats?.projects?.filter((p) => p.status === 'ACTIVE_HEALTHY').length || 0} Active
          </span>
        </div>
      </div>
    </div>
  );
}
