import { useGitDeploy } from './useGitDeploy';

/**
 * @deprecated Use `useGitDeploy('github')` directly instead.
 * This wrapper exists for backward compatibility during migration.
 */
export function useGitHubDeploy() {
  const { isDeploying, handleDeploy, isConnected } = useGitDeploy('github');

  return {
    isDeploying,
    handleGitHubDeploy: handleDeploy,
    isConnected,
  };
}
