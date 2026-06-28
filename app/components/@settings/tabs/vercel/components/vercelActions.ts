import { toast } from 'react-toastify';
import { fetchVercelStats } from '~/lib/stores/vercel';
import type { VercelProject } from '~/types/vercel';

/** Describes a button action that can be performed on a Vercel project. */
export interface ProjectAction {
  name: string;
  icon: string;
  action: (projectId: string) => Promise<void>;
  requiresConfirmation?: boolean;
  variant?: 'default' | 'destructive' | 'outline';
}

/**
 * Build the list of project actions.
 * `token` is the current Vercel API token.
 * `findProject` resolves a project ID to a VercelProject (used by View Analytics).
 */
export function buildProjectActions(
  token: string,
  findProject: (projectId: string) => VercelProject | undefined,
  username: string | undefined,
): ProjectAction[] {
  return [
    {
      name: 'Redeploy',
      icon: 'i-ph:arrows-clockwise',
      action: async (projectId: string) => {
        try {
          const response = await fetch(`https://api.vercel.com/v1/deployments`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: projectId,
              target: 'production',
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to redeploy project');
          }

          toast.success('Project redeployment initiated');
          await fetchVercelStats(token);
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          toast.error(`Failed to redeploy project: ${error}`);
        }
      },
    },
    {
      name: 'View Dashboard',
      icon: 'i-ph:layout',
      action: async (projectId: string) => {
        window.open(`https://vercel.com/dashboard/${projectId}`, '_blank', 'noopener,noreferrer');
      },
    },
    {
      name: 'View Deployments',
      icon: 'i-ph:rocket',
      action: async (projectId: string) => {
        window.open(`https://vercel.com/dashboard/${projectId}/deployments`, '_blank', 'noopener,noreferrer');
      },
    },
    {
      name: 'View Functions',
      icon: 'i-ph:code',
      action: async (projectId: string) => {
        window.open(`https://vercel.com/dashboard/${projectId}/functions`, '_blank', 'noopener,noreferrer');
      },
    },
    {
      name: 'View Analytics',
      icon: 'i-ph:chart-bar',
      action: async (projectId: string) => {
        const project = findProject(projectId);

        if (project) {
          window.open(`https://vercel.com/${username}/${project.name}/analytics`, '_blank', 'noopener,noreferrer');
        }
      },
    },
    {
      name: 'View Domains',
      icon: 'i-ph:globe',
      action: async (projectId: string) => {
        window.open(`https://vercel.com/dashboard/${projectId}/domains`, '_blank', 'noopener,noreferrer');
      },
    },
    {
      name: 'View Settings',
      icon: 'i-ph:gear',
      action: async (projectId: string) => {
        window.open(`https://vercel.com/dashboard/${projectId}/settings`, '_blank', 'noopener,noreferrer');
      },
    },
    {
      name: 'View Logs',
      icon: 'i-ph:scroll',
      action: async (projectId: string) => {
        window.open(`https://vercel.com/dashboard/${projectId}/logs`, '_blank', 'noopener,noreferrer');
      },
    },
    {
      name: 'Delete Project',
      icon: 'i-ph:trash',
      action: async (projectId: string) => {
        try {
          const response = await fetch(`https://api.vercel.com/v1/projects/${projectId}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            throw new Error('Failed to delete project');
          }

          toast.success('Project deleted successfully');
          await fetchVercelStats(token);
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : 'Unknown error';
          toast.error(`Failed to delete project: ${error}`);
        }
      },
      requiresConfirmation: true,
      variant: 'destructive',
    },
  ];
}
