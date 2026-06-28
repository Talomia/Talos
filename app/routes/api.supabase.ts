import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { fetchWithTimeout } from '~/utils/fetchWithTimeout';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.supabase');
import type { SupabaseProject } from '~/types/supabase';

const supabaseAction = async ({ request }: ActionFunctionArgs): Promise<Response> => {
  try {
    const { token } = (await request.json()) as { token: string };

    const projectsResponse = await fetchWithTimeout('https://api.supabase.com/v1/projects', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeoutMs: 15000,
    });

    if (!projectsResponse.ok) {
      const errorText = await projectsResponse.text();
      logger.error('Projects fetch failed:', errorText);

      return json({ error: 'Failed to fetch projects' }, { status: 401 });
    }

    const projects = (await projectsResponse.json()) as SupabaseProject[];

    const uniqueProjectsMap = new Map<string, SupabaseProject>();

    for (const project of projects) {
      if (!uniqueProjectsMap.has(project.id)) {
        uniqueProjectsMap.set(project.id, project);
      }
    }

    const uniqueProjects = Array.from(uniqueProjectsMap.values());

    uniqueProjects.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return json({
      user: { email: 'Connected', role: 'Admin' },
      stats: {
        projects: uniqueProjects,
        totalProjects: uniqueProjects.length,
      },
    });
  } catch (error) {
    logger.error('Supabase API error:', error);
    return json(
      {
        error: 'Authentication failed',
      },
      { status: 401 },
    );
  }
};

export const action = withSecurity(supabaseAction, { allowedMethods: ['POST'] });
