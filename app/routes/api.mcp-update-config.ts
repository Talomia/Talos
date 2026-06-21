import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { createScopedLogger } from '~/utils/logger';
import { MCPService, type MCPConfig } from '~/lib/services/mcpService';
import { z } from 'zod';

const logger = createScopedLogger('api.mcp-update-config');

export const action = withSecurity(async ({ request }: ActionFunctionArgs) => {
  try {
    const mcpConfig = (await request.json()) as MCPConfig;

    if (!mcpConfig || typeof mcpConfig !== 'object') {
      return Response.json({ error: 'Invalid MCP servers configuration' }, { status: 400 });
    }

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
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to update MCP config' },
      { status: 500 },
    );
  }
});
