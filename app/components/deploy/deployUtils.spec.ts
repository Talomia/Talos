import { describe, it, expect } from 'vitest';
import {
  formatBuildFailureOutput,
  sanitizeRepoName,
  classifyDeploymentError,
  formatFileSize,
} from '~/components/deploy/deployUtils';

describe('deployUtils', () => {
  describe('formatBuildFailureOutput', () => {
    it('should return default message for empty output', () => {
      expect(formatBuildFailureOutput(undefined)).toBe('Build failed with no output captured.');
      expect(formatBuildFailureOutput('')).toBe('Build failed with no output captured.');
      expect(formatBuildFailureOutput('   ')).toBe('Build failed with no output captured.');
    });

    it('should return short output as-is', () => {
      expect(formatBuildFailureOutput('Error: missing module')).toBe('Error: missing module');
    });

    it('should truncate long output', () => {
      const longOutput = 'x'.repeat(5000);
      const result = formatBuildFailureOutput(longOutput);
      expect(result).toContain('truncated');
      expect(result.length).toBeLessThan(longOutput.length);
    });
  });

  describe('sanitizeRepoName', () => {
    it('should lowercase the name', () => {
      expect(sanitizeRepoName('My-Project')).toBe('my-project');
    });

    it('should replace spaces with hyphens', () => {
      expect(sanitizeRepoName('my cool project')).toBe('my-cool-project');
    });

    it('should replace underscores with hyphens', () => {
      expect(sanitizeRepoName('my_cool_project')).toBe('my-cool-project');
    });

    it('should remove special characters', () => {
      expect(sanitizeRepoName('my@project!v2')).toBe('myprojectv2');
    });

    it('should collapse multiple hyphens', () => {
      expect(sanitizeRepoName('my---project')).toBe('my-project');
    });

    it('should strip leading/trailing hyphens', () => {
      expect(sanitizeRepoName('-my-project-')).toBe('my-project');
    });

    it('should fall back to my-project for empty input', () => {
      expect(sanitizeRepoName('')).toBe('my-project');
      expect(sanitizeRepoName('!!!')).toBe('my-project');
    });

    it('should limit to 100 characters', () => {
      const longName = 'a'.repeat(200);
      expect(sanitizeRepoName(longName).length).toBeLessThanOrEqual(100);
    });
  });

  describe('classifyDeploymentError', () => {
    it('should classify 401 as auth error', () => {
      const result = classifyDeploymentError(new Error('401 Unauthorized'));
      expect(result.type).toBe('auth');
      expect(result.isRetryable).toBe(false);
    });

    it('should classify 403 as rate limit', () => {
      const result = classifyDeploymentError(new Error('403 Forbidden'));
      expect(result.type).toBe('rate_limit');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify 409 as conflict', () => {
      const result = classifyDeploymentError(new Error('409 Conflict'));
      expect(result.type).toBe('conflict');
      expect(result.isRetryable).toBe(false);
    });

    it('should classify 404 as not found', () => {
      const result = classifyDeploymentError(new Error('404 Not Found'));
      expect(result.type).toBe('not_found');
    });

    it('should classify network errors as retryable', () => {
      const result = classifyDeploymentError(new Error('Network request failed'));
      expect(result.type).toBe('network');
      expect(result.isRetryable).toBe(true);
    });

    it('should classify unknown errors as retryable', () => {
      const result = classifyDeploymentError(new Error('Something strange'));
      expect(result.type).toBe('unknown');
      expect(result.isRetryable).toBe(true);
    });

    it('should handle non-Error objects', () => {
      const result = classifyDeploymentError('string error');
      expect(result.type).toBe('unknown');
    });
  });

  describe('formatFileSize', () => {
    it('should format megabytes', () => {
      expect(formatFileSize(1048576)).toBe('1.0 MB');
      expect(formatFileSize(2621440)).toBe('2.5 MB');
    });

    it('should format kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(51200)).toBe('50.0 KB');
    });

    it('should format bytes', () => {
      expect(formatFileSize(512)).toBe('512 B');
      expect(formatFileSize(0)).toBe('0 B');
    });
  });
});
