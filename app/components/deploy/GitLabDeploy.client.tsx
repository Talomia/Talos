import { useGitDeploy } from './useGitDeploy';

/**
 * @deprecated Use `useGitDeploy('gitlab')` directly instead.
 * This wrapper exists for backward compatibility during migration.
 */
export function useGitLabDeploy() {
  const { isDeploying, handleDeploy, isConnected } = useGitDeploy('gitlab');

  return {
    isDeploying,
    handleGitLabDeploy: handleDeploy,
    isConnected,
  };
}
