import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { fetchWithTimeout } from '~/utils/fetchWithTimeout';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.supabase.variables');

async function supabaseVariablesAction({ request }: ActionFunctionArgs) {
  try {
    // Add proper type assertion for the request body
    const body = (await request.json()) as { projectId?: string; token?: string };
    const { projectId, token } = body;

    if (!projectId || !token) {
      return json({ error: 'Project ID and token are required' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) {
      return json({ error: 'Invalid project ID format' }, { status: 400 });
    }

    const response = await fetchWithTimeout(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectId)}/api-keys`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeoutMs: 15000,
    });

    if (!response.ok) {
      return json({ error: `Failed to fetch API keys: ${response.statusText}` }, { status: response.status });
    }

    const apiKeys = await response.json();

    return json({ apiKeys });
  } catch (error) {
    logger.error('Error fetching project API keys:', error);
    return json({ error: error instanceof Error ? error.message : 'Unknown error occurred' }, { status: 500 });
  }
}

export const action = withSecurity(supabaseVariablesAction, { allowedMethods: ['POST'] });
