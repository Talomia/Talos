import { useState, useEffect } from 'react';
import { getLocalStorage } from '~/lib/persistence/localStorage';
import { sanitizeRepoName } from '~/components/deploy/deployUtils';

/**
 * Minimal shape both GitHubUserResponse and GitLabUserResponse share.
 * Each provider's concrete type satisfies this via structural typing.
 */
export interface DeploymentUser {
  avatar_url: string;
  name: string;
}

/**
 * Minimal shape both GitHubRepoInfo and GitLabProjectInfo share.
 */
export interface DeploymentRepo {
  name: string;
  description: string;
  updated_at: string;
}

export interface UseDeploymentDialogOptions<TUser extends DeploymentUser, TRepo extends DeploymentRepo> {
  /** Whether the dialog is open */
  isOpen: boolean;

  /** Raw project name from the workbench */
  projectName: string;

  /** localStorage key for the provider connection, e.g. 'github_connection' */
  storageKey: string;

  /** Extract the user from the stored connection object */
  getUser: (connection: Record<string, unknown>) => TUser | null;

  /** Extract the token from the stored connection object */
  getToken: (connection: Record<string, unknown>) => string | null;

  /** Fetch repositories given a token (and any provider-specific args from the connection) */
  fetchRepos: (token: string, connection: Record<string, unknown>) => Promise<TRepo[]>;

  /** Callback run after the dialog closes */
  onClose: () => void;

  /** Optional custom repo-name sanitizer. Defaults to `sanitizeRepoName`. */
  sanitizeName?: (name: string) => string;

  /** Additional repo filter predicate beyond name/description (e.g. language for GitHub) */
  extraFilter?: (repo: TRepo, query: string) => boolean;
}

export function useDeploymentDialog<TUser extends DeploymentUser, TRepo extends DeploymentRepo>({
  isOpen,
  projectName,
  storageKey,
  getUser,
  getToken,
  fetchRepos,
  onClose,
  sanitizeName = sanitizeRepoName,
  extraFilter,
}: UseDeploymentDialogOptions<TUser, TRepo>) {
  const [repoName, setRepoName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<TUser | null>(null);
  const [recentRepos, setRecentRepos] = useState<TRepo[]>([]);
  const [filteredRepos, setFilteredRepos] = useState<TRepo[]>([]);
  const [repoSearchQuery, setRepoSearchQuery] = useState('');
  const [isFetchingRepos, setIsFetchingRepos] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdRepoUrl, setCreatedRepoUrl] = useState('');
  const [pushedFiles, setPushedFiles] = useState<{ path: string; size: number }[]>([]);
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  // Init effect — read connection from localStorage and kick off repo fetch
  useEffect(() => {
    if (isOpen) {
      const connection = getLocalStorage(storageKey) as Record<string, unknown> | null;

      setRepoName(sanitizeName(projectName));

      if (connection) {
        const u = getUser(connection);
        const t = getToken(connection);

        if (u && t && t.trim()) {
          setUser(u);
          setIsFetchingRepos(true);
          fetchRepos(t, connection)
            .then((repos) => setRecentRepos(repos))
            .catch(() => {
              /* individual providers handle errors in fetchRepos */
            })
            .finally(() => setIsFetchingRepos(false));
        }
      }
    }
  }, [isOpen, projectName]);

  // Filter repos by search query
  useEffect(() => {
    if (recentRepos.length === 0) {
      setFilteredRepos([]);
      return;
    }

    if (!repoSearchQuery.trim()) {
      setFilteredRepos(recentRepos);
      return;
    }

    const query = repoSearchQuery.toLowerCase().trim();
    const filtered = recentRepos.filter(
      (repo) =>
        repo.name.toLowerCase().includes(query) ||
        (repo.description && repo.description.toLowerCase().includes(query)) ||
        (extraFilter ? extraFilter(repo, query) : false),
    );

    setFilteredRepos(filtered);
  }, [recentRepos, repoSearchQuery]);

  const handleClose = () => {
    setRepoName('');
    setIsPrivate(false);
    setShowSuccessDialog(false);
    setCreatedRepoUrl('');
    onClose();
  };

  const handleAuthDialogClose = () => {
    setShowAuthDialog(false);

    // Refresh user data after auth
    const connection = getLocalStorage(storageKey) as Record<string, unknown> | null;

    if (connection) {
      const u = getUser(connection);
      const t = getToken(connection);

      if (u && t) {
        setUser(u);
        setIsFetchingRepos(true);
        fetchRepos(t, connection)
          .then((repos) => setRecentRepos(repos))
          .catch(() => {
            /* individual providers handle errors in fetchRepos */
          })
          .finally(() => setIsFetchingRepos(false));
      }
    }
  };

  return {
    // State
    repoName,
    setRepoName,
    isPrivate,
    setIsPrivate,
    isLoading,
    setIsLoading,
    user,
    setUser,
    recentRepos,
    setRecentRepos,
    filteredRepos,
    repoSearchQuery,
    setRepoSearchQuery,
    isFetchingRepos,
    showSuccessDialog,
    setShowSuccessDialog,
    createdRepoUrl,
    setCreatedRepoUrl,
    pushedFiles,
    setPushedFiles,
    showAuthDialog,
    setShowAuthDialog,

    // Handlers
    handleClose,
    handleAuthDialogClose,
  };
}
