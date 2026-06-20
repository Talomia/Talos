import { motion } from 'framer-motion';
import { SearchInput, EmptyState, StatusIndicator, Badge } from '~/components/ui';

/**
 * Minimal repo shape accepted by RepoListSection.
 * Both GitHubRepoInfo and GitLabProjectInfo satisfy this.
 */
export interface RepoListItem {
  name: string;
  description: string;
  updated_at: string;
}

interface RepoCardProps<T extends RepoListItem> {
  repo: T;
  brandColor: string;
  repoKey: string;
  onSelect: (name: string) => void;

  /** Render a "private" badge if this returns true */
  isPrivate?: (repo: T) => boolean;

  /** Render extra badges below description (language, stars, forks, etc.) */
  renderBadges?: (repo: T) => React.ReactNode;
}

function RepoCard<T extends RepoListItem>({
  repo,
  brandColor,
  repoKey,
  onSelect,
  isPrivate,
  renderBadges,
}: RepoCardProps<T>) {
  return (
    <motion.button
      key={repoKey}
      type="button"
      onClick={() => onSelect(repo.name)}
      className={`w-full p-3 text-left rounded-lg bg-ui-background-depth-2 dark:bg-ui-background-depth-3 hover:bg-ui-background-depth-3 dark:hover:bg-ui-background-depth-4 transition-colors group border border-ui-borderColor dark:border-ui-borderColor-dark hover:border-${brandColor}-500/30`}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`i-ph:git-branch w-4 h-4 text-${brandColor}-500`} />
          <span
            className={`text-sm font-medium text-ui-textPrimary dark:text-ui-textPrimary-dark group-hover:text-${brandColor}-500`}
          >
            {repo.name}
          </span>
        </div>
        {isPrivate?.(repo) && (
          <Badge variant="primary" size="sm" icon="i-ph:lock w-3 h-3">
            Private
          </Badge>
        )}
      </div>
      {repo.description && (
        <p className="mt-1 text-xs text-ui-textSecondary dark:text-ui-textSecondary-dark line-clamp-2">
          {repo.description}
        </p>
      )}
      {renderBadges && <div className="mt-2 flex items-center gap-2 flex-wrap">{renderBadges(repo)}</div>}
    </motion.button>
  );
}

interface RepoListSectionProps<T extends RepoListItem> {
  recentRepos: T[];
  filteredRepos: T[];
  repoSearchQuery: string;
  isFetchingRepos: boolean;
  brandColor: string;
  providerIcon: string;
  onSearchChange: (value: string) => void;
  onSearchClear: () => void;
  onSelectRepo: (name: string) => void;

  /** Unique key for each repo in the list */
  getRepoKey: (repo: T) => string;

  /** Determines whether a repo is private (for badge display) */
  isPrivate?: (repo: T) => boolean;

  /** Render extra badges per repo card */
  renderBadges?: (repo: T) => React.ReactNode;
}

/**
 * Shared repo search + list section used by both GitHub and GitLab deployment dialogs.
 */
export function RepoListSection<T extends RepoListItem>({
  recentRepos,
  filteredRepos,
  repoSearchQuery,
  isFetchingRepos,
  brandColor,
  providerIcon,
  onSearchChange,
  onSearchClear,
  onSelectRepo,
  getRepoKey,
  isPrivate,
  renderBadges,
}: RepoListSectionProps<T>) {
  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-ui-textSecondary dark:text-ui-textSecondary-dark">Recent Repositories</label>
          <span className="text-xs text-ui-textTertiary dark:text-ui-textTertiary-dark">
            {filteredRepos.length} of {recentRepos.length}
          </span>
        </div>

        <div className="mb-2">
          <SearchInput
            placeholder="Search repositories..."
            value={repoSearchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onClear={onSearchClear}
            className="bg-ui-background-depth-2 dark:bg-ui-background-depth-3 border border-ui-borderColor dark:border-ui-borderColor-dark text-sm"
          />
        </div>

        {recentRepos.length === 0 && !isFetchingRepos ? (
          <EmptyState
            icon={providerIcon}
            title="No repositories found"
            description="We couldn't find any repositories in your account."
            variant="compact"
          />
        ) : (
          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
            {filteredRepos.length === 0 && repoSearchQuery.trim() !== '' ? (
              <EmptyState
                icon="i-ph:magnifying-glass"
                title="No matching repositories"
                description="Try a different search term"
                variant="compact"
              />
            ) : (
              filteredRepos.map((repo) => (
                <RepoCard
                  key={getRepoKey(repo)}
                  repo={repo}
                  brandColor={brandColor}
                  repoKey={getRepoKey(repo)}
                  onSelect={onSelectRepo}
                  isPrivate={isPrivate}
                  renderBadges={renderBadges}
                />
              ))
            )}
          </div>
        )}
      </div>

      {isFetchingRepos && (
        <div className="flex items-center justify-center py-4">
          <StatusIndicator status="loading" pulse={true} label="Loading repositories..." />
        </div>
      )}
    </>
  );
}
