import type { LoaderFunction } from '@remix-run/cloudflare';
import { LLMManager } from '~/lib/modules/llm/manager';
import { getApiKeysFromVault } from '~/lib/api/cookies';

export const loader: LoaderFunction = async ({ context, request }) => {
  try {
    const url = new URL(request.url);
    const provider = url.searchParams.get('provider');

    if (!provider) {
      return Response.json({ isSet: false });
    }

    const llmManager = LLMManager.getInstance((context?.cloudflare?.env as Record<string, string>) ?? {});
    const providerInstance = llmManager.getProvider(provider);

    if (!providerInstance || !providerInstance.config.apiTokenKey) {
      return Response.json({ isSet: false });
    }

    const envVarName = providerInstance.config.apiTokenKey;

    // Get API keys from vault
    const cookieHeader = request.headers.get('Cookie');
    const env = (context?.cloudflare?.env as unknown as Record<string, string>) || {};
    const apiKeys = await getApiKeysFromVault(cookieHeader, env);

    /*
     * Check API key in order of precedence:
     * 1. Client-side API keys (from cookies)
     * 2. Server environment variables (from Cloudflare env)
     * 3. Process environment variables (from .env.local)
     * 4. LLMManager environment variables
     */
    const isSet = !!(
      apiKeys?.[provider] ||
      (context?.cloudflare?.env as Record<string, any>)?.[envVarName] ||
      process.env[envVarName] ||
      llmManager.env[envVarName]
    );

    return Response.json({ isSet });
  } catch {
    return Response.json({ error: 'Failed to check environment key' }, { status: 500 });
  }
};
