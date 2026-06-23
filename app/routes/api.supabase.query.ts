import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { fetchWithTimeout } from '~/utils/fetchWithTimeout';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.supabase.query');

async function supabaseQueryAction({ request }: ActionFunctionArgs) {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return json({ error: 'No authorization token provided' }, { status: 401 });
  }

  try {
    const { projectId, query } = (await request.json()) as { projectId: string; query: string };

    if (!projectId || typeof projectId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(projectId)) {
      return json({ error: 'Invalid project ID' }, { status: 400 });
    }

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return json({ error: 'Query is required' }, { status: 400 });
    }

    // SQL injection guards
    const MAX_QUERY_LENGTH = 10000;

    if (query.length > MAX_QUERY_LENGTH) {
      return json({ error: 'Query too long' }, { status: 400 });
    }

    // Reject multi-statement attacks (semicolons)
    if (query.includes(';')) {
      return json({ error: 'Multi-statement queries are not allowed' }, { status: 400 });
    }

    const normalizedQuery = query.trim().toUpperCase();

    // Statement type allowlist: only SELECT, INSERT, UPDATE
    const ALLOWED_STATEMENTS = ['SELECT', 'INSERT', 'UPDATE'];
    const startsWithAllowed = ALLOWED_STATEMENTS.some((stmt) => normalizedQuery.startsWith(stmt));

    if (!startsWithAllowed) {
      return json({ error: 'Only SELECT, INSERT, and UPDATE queries are allowed' }, { status: 400 });
    }

    // Reject DDL and dangerous statements anywhere in the query
    const DDL_PATTERN = /\b(DROP|ALTER|CREATE|TRUNCATE|COPY|GRANT|REVOKE|EXECUTE|VACUUM|ANALYZE|CLUSTER|REINDEX)\b/i;
    const DANGEROUS_PATTERN = /\bCOMMENT\s+ON\b/i;
    const ANON_BLOCK_PATTERN = /\bDO\b\s*\$/i; // PL/pgSQL anonymous blocks: DO $$...$$
    const SET_PATTERN = /^\s*SET\b/i; // Block SET as statement start (allow inside expressions)
    const CTE_MUTATE_PATTERN = /\bWITH\b[\s\S]+\b(DELETE|UPDATE)\b/i;

    if (DDL_PATTERN.test(query)) {
      return json({ error: 'DDL statements are not allowed' }, { status: 400 });
    }

    if (DANGEROUS_PATTERN.test(query) || ANON_BLOCK_PATTERN.test(query) || SET_PATTERN.test(query)) {
      return json({ error: 'This statement type is not allowed' }, { status: 400 });
    }

    if (CTE_MUTATE_PATTERN.test(query)) {
      return json({ error: 'WITH ... DELETE/UPDATE patterns are not allowed' }, { status: 400 });
    }

    // Reject DELETE without WHERE
    if (/\bDELETE\b/i.test(query)) {
      return json({ error: 'DELETE statements are not allowed' }, { status: 400 });
    }

    logger.debug('Executing query:', { projectId, queryLength: query.length, preview: query.slice(0, 80) });

    const response = await fetchWithTimeout(
      `https://api.supabase.com/v1/projects/${encodeURIComponent(projectId)}/database/query`,
      {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
        timeoutMs: 30000,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;

      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        logger.debug(e);
        errorData = { message: errorText };
      }

      logger.error(
        'Supabase API error:',
        JSON.stringify({
          status: response.status,
          statusText: response.statusText,
          error: errorData,
        }),
      );

      return json(
        {
          error: {
            status: response.status,
            message: 'Query execution failed',
          },
        },
        { status: response.status },
      );
    }

    const result = await response.json();

    return json(result);
  } catch (error) {
    logger.error('Query execution error:', error);
    return json(
      {
        error: {
          message: 'Query execution failed',
        },
      },
      { status: 500 },
    );
  }
}

export const action = withSecurity(supabaseQueryAction, { allowedMethods: ['POST'], requireAuth: true });
