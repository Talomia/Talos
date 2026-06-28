import { formatDistanceToNow } from 'date-fns';
import { Badge } from '~/components/ui/Badge';
import type { NetlifyBuild } from '~/types/netlify';

interface NetlifyBuildListProps {
  builds: NetlifyBuild[];
}

export default function NetlifyBuildList({ builds }: NetlifyBuildListProps) {
  if (builds.length === 0) {
    return null;
  }

  return (
    <div className="bg-ui-background-depth-1 border border-ui-borderColor rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium flex items-center gap-2 text-ui-textPrimary">
          <div className="i-ph:brackets-curly h-4 w-4 text-ui-item-contentAccent" />
          Recent Builds
        </h4>
      </div>
      <div className="space-y-2">
        {builds.map((build) => (
          <div key={build.id} className="bg-ui-background-depth-1 border border-ui-borderColor rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge
                  variant={build.done && !build.error ? 'default' : build.error ? 'destructive' : 'outline'}
                  className="flex items-center gap-1"
                >
                  {build.done && !build.error ? (
                    <div className="i-ph:check-circle h-4 w-4" />
                  ) : build.error ? (
                    <div className="i-ph:x-circle h-4 w-4" />
                  ) : (
                    <div className="i-ph:brackets-curly h-4 w-4" />
                  )}
                  <span className="text-ui-textPrimary">
                    {build.done ? (build.error ? 'Failed' : 'Completed') : 'In Progress'}
                  </span>
                </Badge>
              </div>
              <span className="text-xs text-ui-textSecondary">
                {formatDistanceToNow(new Date(build.created_at))} ago
              </span>
            </div>
            {build.error && (
              <div className="mt-2 text-xs text-ui-textDestructive flex items-center gap-1">
                <div className="i-ph:x-circle h-3 w-3 text-ui-textDestructive" />
                Error: {build.error}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
