import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { getAuthenticatedUser } from '~/lib/.server/supabase';
import {
  listProjects,
  getProject,
  upsertProject,
  updateProjectDescription,
  deleteProject,
  upsertSnapshot,
} from '~/lib/.server/persistence';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.projects');

/**
 * GET /api/projects — List all projects for the authenticated user
 * GET /api/projects?id=<projectId> — Get a specific project with messages + snapshot
 */
export const loader = withSecurity(async ({ request, context }: LoaderFunctionArgs) => {
  const { user, supabase, responseHeaders } = await getAuthenticatedUser(request, context);

  if (!user) {
    // Unauthenticated — return empty list (graceful degradation)
    return json({ projects: [], authenticated: false }, { headers: responseHeaders });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get('id');

  try {
    if (projectId) {
      const result = await getProject(supabase, user.id, projectId);

      if (!result) {
        return json({ project: null }, { status: 404, headers: responseHeaders });
      }

      return json({ project: result.chat, snapshot: result.snapshot }, { headers: responseHeaders });
    }

    const projects = await listProjects(supabase, user.id);

    return json({ projects, authenticated: true }, { headers: responseHeaders });
  } catch (error) {
    logger.error('Failed to load projects:', error);

    return json({ error: 'Failed to load projects' }, { status: 500, headers: responseHeaders });
  }
});

/**
 * POST /api/projects — Create or update a project
 * Body: { id, urlId, description?, messages, metadata?, snapshot? }
 *
 * PUT /api/projects — Update project description
 * Body: { id, description }
 *
 * DELETE /api/projects — Delete a project
 * Body: { id }
 */
export const action = withSecurity(async ({ request, context }: ActionFunctionArgs) => {
  const { user, supabase, responseHeaders } = await getAuthenticatedUser(request, context);

  if (!user) {
    return json({ error: 'Authentication required' }, { status: 401, headers: responseHeaders });
  }

  try {
    if (request.method === 'POST') {
      const body = await request.json<{
        id: string;
        urlId: string;
        description?: string;
        messages: unknown[];
        metadata?: Record<string, unknown>;
        snapshot?: {
          chatIndex: string;
          files: Record<string, unknown>;
          summary?: string;
        };
      }>();

      if (!body.id || !body.urlId) {
        return json({ error: 'id and urlId are required' }, { status: 400 });
      }

      await upsertProject(supabase, user.id, {
        id: body.id,
        urlId: body.urlId,
        description: body.description,
        messages: body.messages || [],
        metadata: body.metadata,
      });

      // Save snapshot if provided
      if (body.snapshot) {
        await upsertSnapshot(supabase, user.id, {
          projectId: body.id,
          chatIndex: body.snapshot.chatIndex,
          files: body.snapshot.files,
          summary: body.snapshot.summary,
        });
      }

      return json({ success: true, id: body.id }, { headers: responseHeaders });
    }

    if (request.method === 'PUT') {
      const body = await request.json<{ id: string; description: string }>();

      if (!body.id || typeof body.description !== 'string') {
        return json({ error: 'id and description are required' }, { status: 400 });
      }

      await updateProjectDescription(supabase, user.id, body.id, body.description);

      return json({ success: true }, { headers: responseHeaders });
    }

    if (request.method === 'DELETE') {
      const body = await request.json<{ id: string }>();

      if (!body.id) {
        return json({ error: 'id is required' }, { status: 400 });
      }

      await deleteProject(supabase, user.id, body.id);

      return json({ success: true }, { headers: responseHeaders });
    }

    return json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    logger.error('Projects action error:', error);

    return json({ error: 'Internal server error' }, { status: 500, headers: responseHeaders });
  }
});
