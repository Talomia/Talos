import { json } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.git-info');

export const loader = withSecurity(async () => {
  let gitInfo = null;

  try {
    // Only available in Node.js environments (Docker/local)
    if (typeof process !== 'undefined' && process.versions?.node) {
      const { execFileSync } = await import('child_process');
      const { existsSync } = await import('fs');

      // Check if we're in a git repository
      if (!existsSync('.git')) {
        return json({
          branch: 'unknown',
          commit: 'unknown',
          isDirty: false,
        });
      }

      // Get current branch
      const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();

      // Get current commit hash
      const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

      // Check if working directory is dirty
      const statusOutput = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
      const isDirty = statusOutput.trim().length > 0;

      // Get remote URL
      let remoteUrl: string | undefined;

      try {
        remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
      } catch {
        // No remote origin, leave as undefined
      }

      // Get last commit info
      let lastCommit: { message: string; date: string; author: string } | undefined;

      try {
        const commitInfo = execFileSync('git', ['log', '-1', '--pretty=format:%s|%ci|%an'], {
          encoding: 'utf8',
        }).trim();
        const [message, date, author] = commitInfo.split('|');
        lastCommit = {
          message: message || 'unknown',
          date: date || 'unknown',
          author: author || 'unknown',
        };
      } catch {
        // Could not get commit info
      }

      gitInfo = { branch, commit, isDirty, remoteUrl, lastCommit };
    }
  } catch {
    // Graceful fallback for CF Workers
  }

  if (gitInfo) {
    return json(gitInfo);
  }

  try {
    return json({
      branch: 'unknown',
      commit: 'unknown',
      isDirty: false,
    });
  } catch (error) {
    logger.error('Error fetching git info:', error);
    return json(
      {
        branch: 'error',
        commit: 'error',
        isDirty: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
});
