import { toast } from 'react-toastify';
import { fetchProjectApiKeys } from '~/lib/stores/supabase';

export interface ProjectAction {
  name: string;
  icon: string;
  action: (projectId: string, token: string) => Promise<void>;
  requiresConfirmation?: boolean;
  variant?: 'default' | 'destructive' | 'outline';
}

// Project actions
export const projectActions: ProjectAction[] = [
  {
    name: 'Get API Keys',
    icon: 'i-ph:key',
    action: async (projectId: string, token: string) => {
      try {
        await fetchProjectApiKeys(projectId, token);
        toast.success('API keys fetched successfully');
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : 'Unknown error';
        toast.error(`Failed to fetch API keys: ${error}`);
      }
    },
  },
  {
    name: 'View Dashboard',
    icon: 'i-ph:layout',
    action: async (projectId: string) => {
      window.open(`https://supabase.com/dashboard/project/${projectId}`, '_blank');
    },
  },
  {
    name: 'View Database',
    icon: 'i-ph:database',
    action: async (projectId: string) => {
      window.open(`https://supabase.com/dashboard/project/${projectId}/editor`, '_blank');
    },
  },
  {
    name: 'View Auth',
    icon: 'i-ph:user-circle',
    action: async (projectId: string) => {
      window.open(`https://supabase.com/dashboard/project/${projectId}/auth/users`, '_blank');
    },
  },
  {
    name: 'View Storage',
    icon: 'i-ph:folder',
    action: async (projectId: string) => {
      window.open(`https://supabase.com/dashboard/project/${projectId}/storage/buckets`, '_blank');
    },
  },
  {
    name: 'View Functions',
    icon: 'i-ph:code',
    action: async (projectId: string) => {
      window.open(`https://supabase.com/dashboard/project/${projectId}/functions`, '_blank');
    },
  },
  {
    name: 'View Logs',
    icon: 'i-ph:scroll',
    action: async (projectId: string) => {
      window.open(`https://supabase.com/dashboard/project/${projectId}/logs`, '_blank');
    },
  },
  {
    name: 'View Settings',
    icon: 'i-ph:gear',
    action: async (projectId: string) => {
      window.open(`https://supabase.com/dashboard/project/${projectId}/settings`, '_blank');
    },
  },
  {
    name: 'View API Docs',
    icon: 'i-ph:book',
    action: async (projectId: string) => {
      window.open(`https://supabase.com/dashboard/project/${projectId}/api`, '_blank');
    },
  },
  {
    name: 'View Realtime',
    icon: 'i-ph:radio',
    action: async (projectId: string) => {
      window.open(`https://supabase.com/dashboard/project/${projectId}/realtime`, '_blank');
    },
  },
  {
    name: 'View Edge Functions',
    icon: 'i-ph:terminal',
    action: async (projectId: string) => {
      window.open(`https://supabase.com/dashboard/project/${projectId}/functions`, '_blank');
    },
  },
];
