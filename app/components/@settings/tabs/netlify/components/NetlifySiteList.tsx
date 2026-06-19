import { classNames } from '~/utils/classNames';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '~/components/ui/Button';
import { Badge } from '~/components/ui/Badge';
import type { NetlifySite } from '~/types/netlify';
import type { SiteAction } from './netlifyActions';

interface NetlifySiteListProps {
  sites: NetlifySite[];
  activeSiteIndex: number;
  onSelectSite: (index: number) => void;
  siteActions: SiteAction[];
  isActionLoading: boolean;
  onActionLoadingChange: (loading: boolean) => void;
  fetchingStats: boolean;
  onRefresh: () => void;
}

export default function NetlifySiteList({
  sites,
  activeSiteIndex,
  onSelectSite,
  siteActions,
  isActionLoading,
  onActionLoadingChange,
  fetchingStats,
  onRefresh,
}: NetlifySiteListProps) {
  if (sites.length === 0) {
    return null;
  }

  return (
    <div className="bg-bolt-elements-background dark:bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-sm font-medium flex items-center gap-2 text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
          <div className="i-ph:buildings h-4 w-4 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
          Your Sites
        </h4>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={fetchingStats}
          className="flex items-center gap-2 text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary hover:bg-bolt-elements-item-backgroundActive/10"
        >
          <div
            className={classNames(
              'i-ph:arrows-clockwise h-4 w-4 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent',
              { 'animate-spin': fetchingStats },
            )}
          />
          {fetchingStats ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>
      <div className="space-y-3">
        {sites.map((site, index) => (
          <div
            key={site.id}
            className={classNames(
              'bg-bolt-elements-background dark:bg-bolt-elements-background-depth-1 border rounded-lg p-4 transition-all',
              activeSiteIndex === index
                ? 'border-bolt-elements-item-contentAccent bg-bolt-elements-item-backgroundActive/10'
                : 'border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive/70',
            )}
            onClick={() => {
              onSelectSite(index);
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="i-ph:cloud h-5 w-5 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
                <span className="font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                  {site.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={site.published_deploy?.state === 'ready' ? 'default' : 'destructive'}
                  className="flex items-center gap-1 text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary"
                >
                  {site.published_deploy?.state === 'ready' ? (
                    <div className="i-ph:check-circle h-4 w-4 text-green-500" />
                  ) : (
                    <div className="i-ph:x-circle h-4 w-4 text-red-500" />
                  )}
                  <span className="text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                    {site.published_deploy?.state || 'Unknown'}
                  </span>
                </Badge>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <a
                href={site.ssl_url || site.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm flex items-center gap-1 transition-colors text-bolt-elements-link-text hover:text-bolt-elements-link-textHover dark:text-white dark:hover:text-bolt-elements-link-textHover"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="i-ph:cloud h-3 w-3 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
                <span className="underline decoration-1 underline-offset-2">{site.ssl_url || site.url}</span>
              </a>
            </div>

            {activeSiteIndex === index && (
              <>
                <div className="mt-4 pt-3 border-t border-bolt-elements-borderColor">
                  <div className="flex items-center gap-2">
                    {siteActions.map((action) => (
                      <Button
                        key={action.name}
                        variant={action.variant || 'outline'}
                        size="sm"
                        onClick={async (e) => {
                          e.stopPropagation();

                          if (action.requiresConfirmation) {
                            if (!confirm(`Are you sure you want to ${action.name.toLowerCase()}?`)) {
                              return;
                            }
                          }

                          onActionLoadingChange(true);
                          await action.action(site.id);
                          onActionLoadingChange(false);
                        }}
                        disabled={isActionLoading}
                        className="flex items-center gap-1 text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary"
                      >
                        <div
                          className={classNames(
                            action.icon,
                            'h-4 w-4 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent',
                          )}
                        />
                        {action.name}
                      </Button>
                    ))}
                  </div>
                </div>
                {site.published_deploy && (
                  <div className="mt-3 text-sm">
                    <div className="flex items-center gap-1">
                      <div className="i-ph:clock h-4 w-4 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
                      <span className="text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
                        Published {formatDistanceToNow(new Date(site.published_deploy.published_at))} ago
                      </span>
                    </div>
                    {site.published_deploy.branch && (
                      <div className="flex items-center gap-1 mt-1">
                        <div className="i-ph:brackets-curly h-4 w-4 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
                        <span className="text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
                          Branch: {site.published_deploy.branch}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
