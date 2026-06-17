import { useState } from 'react';
import Cookies from 'js-cookie';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';
import type { ProviderInfo } from '~/types/model';

export interface UseChatModelReturn {
  model: string;
  setModel: React.Dispatch<React.SetStateAction<string>>;
  provider: ProviderInfo;
  setProvider: React.Dispatch<React.SetStateAction<ProviderInfo>>;
  handleModelChange: (newModel: string) => void;
  handleProviderChange: (newProvider: ProviderInfo) => void;
}

export function useChatModel(): UseChatModelReturn {
  const [model, setModel] = useState(() => {
    const savedModel = Cookies.get('selectedModel');
    return savedModel || DEFAULT_MODEL;
  });
  const [provider, setProvider] = useState(() => {
    const savedProvider = Cookies.get('selectedProvider');
    return (PROVIDER_LIST.find((p) => p.name === savedProvider) || DEFAULT_PROVIDER) as ProviderInfo;
  });

  const handleModelChange = (newModel: string) => {
    setModel(newModel);
    Cookies.set('selectedModel', newModel, { expires: 30 });
  };

  const handleProviderChange = (newProvider: ProviderInfo) => {
    setProvider(newProvider);
    Cookies.set('selectedProvider', newProvider.name, { expires: 30 });
  };

  return { model, setModel, provider, setProvider, handleModelChange, handleProviderChange };
}
