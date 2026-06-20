import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import type { ProviderInfo } from '~/types/model';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { classNames } from '~/utils/classNames';
import { LOCAL_PROVIDERS } from '~/lib/stores/settings';
import type { ConnectionStatus } from '~/components/chat/modelSelectorUtils';
import { filterProviders, SCROLLBAR_CLASSES } from '~/components/chat/modelSelectorUtils';

interface ProviderDropdownProps {
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  setModel?: (model: string) => void;
  providerList: ProviderInfo[];
  modelList: ModelInfo[];
  localProviderStatus: Record<string, ConnectionStatus>;
}

export const ProviderDropdown = ({
  provider,
  setProvider,
  setModel,
  providerList,
  modelList,
  localProviderStatus,
}: ProviderDropdownProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<(HTMLDivElement | null)[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce search queries
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 150);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredProviders = useMemo(
    () => filterProviders(providerList, debouncedSearchQuery),
    [providerList, debouncedSearchQuery],
  );

  useEffect(() => {
    setFocusedIndex(-1);
  }, [debouncedSearchQuery, isOpen]);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setDebouncedSearchQuery('');

    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (focusedIndex >= 0 && optionsRef.current[focusedIndex]) {
      optionsRef.current[focusedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex]);

  const selectProvider = useCallback(
    (selectedProvider: ProviderInfo) => {
      if (setProvider) {
        setProvider(selectedProvider);

        const firstModel = modelList.find((m) => m.provider === selectedProvider.name);

        if (firstModel && setModel) {
          setModel(firstModel.name);
        }
      }

      setIsOpen(false);
      setSearchQuery('');
      setDebouncedSearchQuery('');
    },
    [setProvider, setModel, modelList],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1 >= filteredProviders.length ? 0 : prev + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 < 0 ? filteredProviders.length - 1 : prev - 1));
        break;
      case 'Enter':
        e.preventDefault();

        if (focusedIndex >= 0 && focusedIndex < filteredProviders.length) {
          selectProvider(filteredProviders[focusedIndex]);
        }

        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery('');
        setDebouncedSearchQuery('');
        break;
      case 'Tab':
        if (!e.shiftKey && focusedIndex === filteredProviders.length - 1) {
          setIsOpen(false);
        }

        break;
      case 'k':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          clearSearch();
        }

        break;
    }
  };

  return (
    <div className="relative flex w-full" onKeyDown={handleKeyDown} ref={dropdownRef}>
      <div
        className={classNames(
          'w-full p-2 rounded-lg border border-ui-borderColor',
          'bg-ui-prompt-background text-ui-textPrimary',
          'focus-within:outline-none focus-within:ring-2 focus-within:ring-ui-focus',
          'transition-all cursor-pointer',
          isOpen ? 'ring-2 ring-ui-focus' : undefined,
        )}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls="provider-listbox"
        aria-haspopup="listbox"
        tabIndex={0}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 truncate">
            {provider?.name && LOCAL_PROVIDERS.includes(provider.name) && (
              <span
                className={classNames(
                  'inline-block w-2 h-2 rounded-full flex-shrink-0',
                  localProviderStatus[provider.name] === 'connected'
                    ? 'bg-green-500'
                    : localProviderStatus[provider.name] === 'disconnected'
                      ? 'bg-red-400'
                      : 'bg-ui-textTertiary',
                )}
                title={
                  localProviderStatus[provider.name] === 'connected'
                    ? `${provider.name} is running`
                    : localProviderStatus[provider.name] === 'disconnected'
                      ? `${provider.name} is not reachable`
                      : 'Checking...'
                }
              />
            )}
            {provider?.name || 'Select provider'}
          </div>
          <div
            className={classNames(
              'i-ph:caret-down w-4 h-4 text-ui-textSecondary opacity-75',
              isOpen ? 'rotate-180' : undefined,
            )}
          />
        </div>
      </div>

      {isOpen && (
        <div
          className="absolute z-20 w-full mt-1 py-1 rounded-lg border border-ui-borderColor bg-ui-background-depth-2 shadow-lg"
          role="listbox"
          id="provider-listbox"
        >
          <div className="px-2 pb-2">
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search providers... (⌘K to clear)"
                className={classNames(
                  'w-full pl-8 pr-8 py-1.5 rounded-md text-sm',
                  'bg-ui-background-depth-2 border border-ui-borderColor',
                  'text-ui-textPrimary placeholder:text-ui-textTertiary',
                  'focus:outline-none focus:ring-2 focus:ring-ui-focus',
                  'transition-all',
                )}
                onClick={(e) => e.stopPropagation()}
                role="searchbox"
                aria-label="Search providers"
              />
              <div className="absolute left-2.5 top-1/2 -translate-y-1/2">
                <span className="i-ph:magnifying-glass text-ui-textTertiary" />
              </div>
              {searchQuery && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearSearch();
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-ui-background-depth-3 transition-colors"
                  aria-label="Clear search"
                >
                  <span className="i-ph:x text-ui-textTertiary text-xs" />
                </button>
              )}
            </div>
          </div>

          <div className={classNames(...SCROLLBAR_CLASSES)}>
            {filteredProviders.length === 0 ? (
              <div className="px-3 py-3 text-sm">
                <div className="text-ui-textTertiary mb-1">
                  {debouncedSearchQuery ? `No providers match "${debouncedSearchQuery}"` : 'No providers found'}
                </div>
                {debouncedSearchQuery && (
                  <div className="text-xs text-ui-textTertiary">
                    Try searching for provider names like "OpenAI", "Anthropic", or "Google"
                  </div>
                )}
              </div>
            ) : (
              filteredProviders.map((providerOption, index) => (
                <div
                  ref={(el) => (optionsRef.current[index] = el)}
                  key={providerOption.name}
                  role="option"
                  aria-selected={provider?.name === providerOption.name}
                  className={classNames(
                    'px-3 py-2 text-sm cursor-pointer',
                    'hover:bg-ui-background-depth-3',
                    'text-ui-textPrimary',
                    'outline-none',
                    provider?.name === providerOption.name || focusedIndex === index
                      ? 'bg-ui-background-depth-2'
                      : undefined,
                    focusedIndex === index ? 'ring-1 ring-inset ring-ui-focus' : undefined,
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectProvider(providerOption);
                  }}
                  tabIndex={focusedIndex === index ? 0 : -1}
                >
                  <div className="flex items-center gap-2">
                    {LOCAL_PROVIDERS.includes(providerOption.name) && (
                      <span
                        className={classNames(
                          'inline-block w-2 h-2 rounded-full flex-shrink-0',
                          localProviderStatus[providerOption.name] === 'connected'
                            ? 'bg-green-500'
                            : localProviderStatus[providerOption.name] === 'disconnected'
                              ? 'bg-red-400'
                              : 'bg-ui-textTertiary',
                        )}
                      />
                    )}
                    <span>{providerOption.name}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
