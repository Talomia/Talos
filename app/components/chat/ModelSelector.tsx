import type { ProviderInfo } from '~/types/model';
import { useEffect, useState } from 'react';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { LOCAL_PROVIDERS } from '~/lib/stores/settings';
import type { ConnectionStatus } from '~/components/chat/modelSelectorUtils';
import { ProviderDropdown } from '~/components/chat/ProviderDropdown';
import { ModelDropdown } from '~/components/chat/ModelDropdown';

interface ModelSelectorProps {
  model?: string;
  setModel?: (model: string) => void;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  modelList: ModelInfo[];
  providerList: ProviderInfo[];
  apiKeys: Record<string, string>;
  modelLoading?: string;
}

export const ModelSelector = ({
  model,
  setModel,
  provider,
  setProvider,
  modelList,
  providerList,
  modelLoading,
}: ModelSelectorProps) => {
  const [localProviderStatus, setLocalProviderStatus] = useState<Record<string, ConnectionStatus>>({});

  // Check connectivity of local providers when provider list changes
  useEffect(() => {
    const checkLocalProviders = async () => {
      const statuses: Record<string, 'connected' | 'disconnected'> = {};

      for (const p of providerList) {
        if (!LOCAL_PROVIDERS.includes(p.name)) {
          continue;
        }

        // If the provider has models loaded, it's connected
        const hasModels = modelList.some((m) => m.provider === p.name);

        statuses[p.name] = hasModels ? 'connected' : 'disconnected';
      }

      setLocalProviderStatus(statuses);
    };

    checkLocalProviders();
  }, [providerList, modelList]);

  useEffect(() => {
    if (providerList.length === 0) {
      return;
    }

    if (provider && !providerList.some((p) => p.name === provider.name)) {
      const firstEnabledProvider = providerList[0];
      setProvider?.(firstEnabledProvider);

      const firstModel = modelList.find((m) => m.provider === firstEnabledProvider.name);

      if (firstModel) {
        setModel?.(firstModel.name);
      }
    }
  }, [providerList, provider, setProvider, modelList, setModel]);

  if (providerList.length === 0) {
    return (
      <div className="mb-2 p-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-prompt-background text-bolt-elements-textPrimary">
        <p className="text-center">
          No providers are currently enabled. Please enable at least one provider in the settings to start using the
          chat.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-2 flex-col sm:flex-row">
      {/* Provider Combobox */}
      <ProviderDropdown
        provider={provider}
        setProvider={setProvider}
        setModel={setModel}
        providerList={providerList}
        modelList={modelList}
        localProviderStatus={localProviderStatus}
      />

      {/* Model Combobox */}
      <ModelDropdown
        model={model}
        setModel={setModel}
        providerName={provider?.name}
        modelList={modelList}
        modelLoading={modelLoading}
      />
    </div>
  );
};
