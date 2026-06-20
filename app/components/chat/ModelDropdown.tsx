import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { classNames } from '~/utils/classNames';
import { LOCAL_PROVIDERS } from '~/lib/stores/settings';
import {
  filterModels,
  formatContextSize,
  isModelLikelyFree,
  SCROLLBAR_CLASSES,
} from '~/components/chat/modelSelectorUtils';

interface ModelDropdownProps {
  model?: string;
  setModel?: (model: string) => void;
  providerName?: string;
  modelList: ModelInfo[];
  modelLoading?: string;
}

export const ModelDropdown = ({ model, setModel, providerName, modelList, modelLoading }: ModelDropdownProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [showFreeModelsOnly, setShowFreeModelsOnly] = useState(false);
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

  const filteredModels = useMemo(
    () => filterModels(modelList, providerName, showFreeModelsOnly, debouncedSearchQuery),
    [modelList, providerName, showFreeModelsOnly, debouncedSearchQuery],
  );

  // Reset free models filter when provider changes
  useEffect(() => {
    setShowFreeModelsOnly(false);
  }, [providerName]);

  useEffect(() => {
    setFocusedIndex(-1);
  }, [debouncedSearchQuery, isOpen, showFreeModelsOnly]);

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

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isOpen) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1 >= filteredModels.length ? 0 : prev + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 < 0 ? filteredModels.length - 1 : prev - 1));
        break;
      case 'Enter':
        e.preventDefault();

        if (focusedIndex >= 0 && focusedIndex < filteredModels.length) {
          const selectedModel = filteredModels[focusedIndex];
          setModel?.(selectedModel.name);
          setIsOpen(false);
          setSearchQuery('');
          setDebouncedSearchQuery('');
        }

        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery('');
        setDebouncedSearchQuery('');
        break;
      case 'Tab':
        if (!e.shiftKey && focusedIndex === filteredModels.length - 1) {
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
    <div className="relative flex w-full min-w-[70%]" onKeyDown={handleKeyDown} ref={dropdownRef}>
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
        aria-controls="model-listbox"
        aria-haspopup="listbox"
        tabIndex={0}
      >
        <div className="flex items-center justify-between">
          <div className="truncate">{modelList.find((m) => m.name === model)?.label || 'Select model'}</div>
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
          className="absolute z-10 w-full mt-1 py-1 rounded-lg border border-ui-borderColor bg-ui-background-depth-2 shadow-lg"
          role="listbox"
          id="model-listbox"
        >
          <div className="px-2 pb-2 space-y-2">
            {/* Free Models Filter Toggle - Only show for OpenRouter */}
            {providerName === 'OpenRouter' && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFreeModelsOnly(!showFreeModelsOnly);
                  }}
                  className={classNames(
                    'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all',
                    'hover:bg-ui-background-depth-3',
                    showFreeModelsOnly
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'bg-ui-background-depth-3 text-ui-textSecondary border border-ui-borderColor',
                  )}
                >
                  <span className="i-ph:gift text-xs" />
                  Free models only
                </button>
                {showFreeModelsOnly && (
                  <span className="text-xs text-ui-textTertiary">
                    {filteredModels.length} free model{filteredModels.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}

            {/* Search Result Count */}
            {debouncedSearchQuery && filteredModels.length > 0 && (
              <div className="text-xs text-ui-textTertiary px-1">
                {filteredModels.length} model{filteredModels.length !== 1 ? 's' : ''} found
                {filteredModels.length > 5 && ' (showing best matches)'}
              </div>
            )}

            {/* Search Input */}
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models... (⌘K to clear)"
                className={classNames(
                  'w-full pl-8 pr-8 py-1.5 rounded-md text-sm',
                  'bg-ui-background-depth-2 border border-ui-borderColor',
                  'text-ui-textPrimary placeholder:text-ui-textTertiary',
                  'focus:outline-none focus:ring-2 focus:ring-ui-focus',
                  'transition-all',
                )}
                onClick={(e) => e.stopPropagation()}
                role="searchbox"
                aria-label="Search models"
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
            {modelLoading === 'all' || modelLoading === providerName ? (
              <div className="px-3 py-3 text-sm">
                <div className="flex items-center gap-2 text-ui-textTertiary">
                  <span className="i-ph:spinner animate-spin" />
                  Loading models...
                </div>
              </div>
            ) : filteredModels.length === 0 ? (
              <div className="px-3 py-3 text-sm">
                <div className="text-ui-textTertiary mb-1">
                  {debouncedSearchQuery
                    ? `No models match "${debouncedSearchQuery}"${showFreeModelsOnly ? ' (free only)' : ''}`
                    : showFreeModelsOnly
                      ? 'No free models available'
                      : providerName && LOCAL_PROVIDERS.includes(providerName)
                        ? `No models found — is ${providerName} running?`
                        : 'No models available'}
                </div>
                {!debouncedSearchQuery && providerName && LOCAL_PROVIDERS.includes(providerName) && (
                  <div className="text-xs text-ui-textTertiary mt-1">
                    Make sure {providerName} is running and has at least one model loaded.
                    {providerName === 'Ollama' && ' Try: ollama pull llama3.2'}
                    {providerName === 'LMStudio' && ' Load a model in LM Studio first.'}
                  </div>
                )}
                {debouncedSearchQuery && (
                  <div className="text-xs text-ui-textTertiary">
                    Try searching for model names, context sizes (e.g., "128k", "1M"), or capabilities
                  </div>
                )}
                {showFreeModelsOnly && !debouncedSearchQuery && (
                  <div className="text-xs text-ui-textTertiary">
                    Try disabling the "Free models only" filter to see all available models
                  </div>
                )}
              </div>
            ) : (
              filteredModels.map((modelOption, index) => (
                <div
                  ref={(el) => (optionsRef.current[index] = el)}
                  key={modelOption.name}
                  role="option"
                  aria-selected={model === modelOption.name}
                  className={classNames(
                    'px-3 py-2 text-sm cursor-pointer',
                    'hover:bg-ui-background-depth-3',
                    'text-ui-textPrimary',
                    'outline-none',
                    model === modelOption.name || focusedIndex === index ? 'bg-ui-background-depth-2' : undefined,
                    focusedIndex === index ? 'ring-1 ring-inset ring-ui-focus' : undefined,
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setModel?.(modelOption.name);
                    setIsOpen(false);
                    setSearchQuery('');
                    setDebouncedSearchQuery('');
                  }}
                  tabIndex={focusedIndex === index ? 0 : -1}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="truncate">
                        <span>{modelOption.label}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-ui-textTertiary">
                          {formatContextSize(modelOption.maxTokenAllowed)} tokens
                        </span>
                        {debouncedSearchQuery &&
                          modelOption.searchScore !== undefined &&
                          modelOption.searchScore > 70 && (
                            <span className="text-xs text-green-500 font-medium">
                              {modelOption.searchScore.toFixed(0)}% match
                            </span>
                          )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      {isModelLikelyFree(modelOption, providerName) && (
                        <span className="i-ph:gift text-xs text-purple-400" title="Free model" />
                      )}
                      {model === modelOption.name && (
                        <span className="i-ph:check text-xs text-green-500" title="Selected" />
                      )}
                    </div>
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
