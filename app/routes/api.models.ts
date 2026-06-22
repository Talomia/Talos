import { json } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { ProviderInfo } from '~/types/model';
import { getApiKeysFromVault } from '~/lib/.server/api-key-vault';
import { getProviderSettingsFromCookie } from '~/lib/api/cookies';

interface ModelsResponse {
  modelList: ModelInfo[];
  providers: ProviderInfo[];
  defaultProvider: ProviderInfo;
}

let cachedProviders: ProviderInfo[] | null = null;
let cachedDefaultProvider: ProviderInfo | null = null;

function getProviderInfo(llmManager: LLMManager) {
  if (!cachedProviders) {
    cachedProviders = llmManager.getAllProviders().map((provider) => ({
      name: provider.name,
      staticModels: provider.staticModels,
      getApiKeyLink: provider.getApiKeyLink,
      labelForGetApiKey: provider.labelForGetApiKey,
      icon: provider.icon,
    }));
  }

  if (!cachedDefaultProvider) {
    const defaultProvider = llmManager.getDefaultProvider();
    cachedDefaultProvider = {
      name: defaultProvider.name,
      staticModels: defaultProvider.staticModels,
      getApiKeyLink: defaultProvider.getApiKeyLink,
      labelForGetApiKey: defaultProvider.labelForGetApiKey,
      icon: defaultProvider.icon,
    };
  }

  return { providers: cachedProviders, defaultProvider: cachedDefaultProvider };
}

export const loader = withSecurity(
  async ({
    request,
    params,
    context,
  }: {
    request: Request;
    params: { provider?: string };
    context: {
      cloudflare?: {
        env: Env;
      };
    };
  }) => {
    try {
      const llmManager = LLMManager.getInstance(context.cloudflare?.env);

      // Get API keys from encrypted vault and provider settings from cookies
      const cookieHeader = request.headers.get('Cookie');
      const env = context.cloudflare?.env || {};
      const apiKeys = await getApiKeysFromVault(cookieHeader, env);
      const providerSettings = getProviderSettingsFromCookie(cookieHeader);

      const { providers, defaultProvider } = getProviderInfo(llmManager);

      let modelList: ModelInfo[] = [];

      if (params.provider) {
        // Only update models for the specific provider
        const provider = llmManager.getProvider(params.provider);

        if (provider) {
          modelList = await llmManager.getModelListFromProvider(provider, {
            apiKeys,
            providerSettings,
            serverEnv: context.cloudflare?.env,
          });
        }
      } else {
        // Update all models
        modelList = await llmManager.updateModelList({
          apiKeys,
          providerSettings,
          serverEnv: context.cloudflare?.env,
        });
      }

      return json<ModelsResponse>({
        modelList,
        providers,
        defaultProvider,
      });
    } catch {
      return json({ error: 'Failed to fetch models' }, { status: 500 });
    }
  },
);
