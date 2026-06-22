import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.supabase.query');

async function supabaseQueryAction({ request }: ActionFunctionArgs) {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'No authorization token provided' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { projectId, query } = (await request.json()) as { projectId: string; query: string };

    if (!projectId || typeof projectId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(projectId)) {
      return new Response(JSON.stringify({ error: 'Invalid project ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // SQL injection guards
    const MAX_QUERY_LENGTH = 10000;

    if (query.length > MAX_QUERY_LENGTH) {
      return new Response(JSON.stringify({ error: 'Query too long' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Reject multi-statement attacks (semicolons)
    if (query.includes(';')) {
      return new Response(JSON.stringify({ error: 'Multi-statement queries are not allowed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const normalizedQuery = query.trim().toUpperCase();

    // Statement type allowlist: only SELECT, INSERT, UPDATE
    const ALLOWED_STATEMENTS = ['SELECT', 'INSERT', 'UPDATE'];
    const startsWithAllowed = ALLOWED_STATEMENTS.some((stmt) => normalizedQuery.startsWith(stmt));

    if (!startsWithAllowed) {
      return new Response(JSON.stringify({ error: 'Only SELECT, INSERT, and UPDATE queries are allowed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Reject DDL statements anywhere in the query
    const DDL_PATTERN = /\b(DROP|ALTER|CREATE|TRUNCATE)\b/i;

    if (DDL_PATTERN.test(query)) {
      return new Response(JSON.stringify({ error: 'DDL statements are not allowed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Reject DELETE without WHERE
    if (/\bDELETE\b/i.test(query)) {
      return new Response(JSON.stringify({ error: 'DELETE statements are not allowed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    logger.debug('Executing query:', { projectId, query });

    const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(projectId)}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

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

      return new Response(
        JSON.stringify({
          error: {
            status: response.status,
            message: 'Query execution failed',
          },
        }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    }

    const result = await response.json();

    return new Response(JSON.stringify(result), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    logger.error('Query execution error:', error);
    return new Response(
      JSON.stringify({
        error: {
          message: 'Query execution failed',
        },
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }
}

export const action = withSecurity(supabaseQueryAction, { allowedMethods: ['POST'], requireAuth: true });
