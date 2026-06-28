import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { createScopedLogger } from '~/utils/logger';
import { MCPService, mcpConfigSchema } from '~/lib/services/mcpService';
import { z } from 'zod';

const logger = createScopedLogger('api.mcp-update-config');

export const action = withSecurity(async ({ request }: ActionFunctionArgs) => {
  try {
    const rawBody = await request.json();
    const mcpConfig = mcpConfigSchema.parse(rawBody);

    const mcpService = MCPService.getInstance();
    const serverTools = await mcpService.updateConfig(mcpConfig);

    return Response.json(serverTools);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const validationDetails = error.errors.map((err) => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));
      logger.error('MCP config validation error:', validationDetails);

      return Response.json(
        { error: 'MCP configuration validation failed', details: validationDetails },
        { status: 400 },
      );
    }

    logger.error('Error updating MCP config:', error);

    return Response.json({ error: 'Failed to update MCP config' }, { status: 500 });
  }
});
