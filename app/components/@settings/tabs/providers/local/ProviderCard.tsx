import React from 'react';
import { Switch } from '~/components/ui/Switch';
import { Card, CardContent } from '~/components/ui/Card';
import { classNames } from '~/utils/classNames';
import type { IProviderConfig } from '~/types/model';
import { PROVIDER_DESCRIPTIONS } from './types';

// Icon class mapping for providers
const PROVIDER_ICON_CLASSES: Record<string, string> = {
  Ollama: 'i-ph:hard-drives',
  LMStudio: 'i-ph:monitor',
  OpenAILike: 'i-ph:globe',
};

// Provider Card Component
interface ProviderCardProps {
  provider: IProviderConfig;
  onToggle: (enabled: boolean) => void;
  onUpdateBaseUrl: (url: string) => void;
  isEditing: boolean;
  onStartEditing: () => void;
  onStopEditing: () => void;
}

function ProviderCard({
  provider,
  onToggle,
  onUpdateBaseUrl,
  isEditing,
  onStartEditing,
  onStopEditing,
}: ProviderCardProps) {
  const iconClass = PROVIDER_ICON_CLASSES[provider.name] || 'i-ph:hard-drives';

  return (
    <Card className="bg-ui-background-depth-2 hover:bg-ui-background-depth-3 transition-all duration-300 shadow-sm hover:shadow-md border border-ui-borderColor hover:border-accent-500/30">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            <div
              className={classNames(
                'w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300',
                provider.settings.enabled
                  ? 'bg-gradient-to-br from-accent-500/20 to-accent-600/20 ring-1 ring-accent-500/30'
                  : 'bg-ui-background-depth-3',
              )}
            >
              <div
                className={classNames(
                  iconClass,
                  'w-6 h-6 transition-all duration-300',
                  provider.settings.enabled ? 'text-accent-500' : 'text-ui-textTertiary',
                )}
              />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-semibold text-ui-textPrimary">{provider.name}</h3>
                <span className="px-2 py-1 text-xs rounded-full bg-green-500/10 text-green-500 font-medium">Local</span>
              </div>
              <p className="text-sm text-ui-textSecondary mb-4">
                {PROVIDER_DESCRIPTIONS[provider.name as keyof typeof PROVIDER_DESCRIPTIONS]}
              </p>

              {provider.settings.enabled && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-ui-textPrimary">API Endpoint</label>
                  {isEditing ? (
                    <input
                      type="text"
                      defaultValue={provider.settings.baseUrl}
                      placeholder={`Enter ${provider.name} base URL`}
                      className="w-full px-4 py-3 rounded-lg text-sm bg-ui-background-depth-4 border border-accent-500/30 text-ui-textPrimary placeholder-ui-textTertiary focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500 transition-all duration-200 shadow-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onUpdateBaseUrl(e.currentTarget.value);
                          onStopEditing();
                        } else if (e.key === 'Escape') {
                          onStopEditing();
                        }
                      }}
                      onBlur={(e) => {
                        onUpdateBaseUrl(e.target.value);
                        onStopEditing();
                      }}
                      autoFocus
                    />
                  ) : (
                    <button
                      onClick={onStartEditing}
                      className="w-full px-4 py-3 rounded-lg text-sm bg-ui-background-depth-3 border border-ui-borderColor hover:border-accent-500/30 hover:bg-ui-background-depth-4 hover:shadow-sm transition-all duration-200 text-left group"
                    >
                      <div className="flex items-center gap-3 text-ui-textSecondary group-hover:text-ui-textPrimary">
                        <div className="i-ph:link w-4 h-4 group-hover:text-accent-500 transition-colors" />
                        <span className="font-mono">{provider.settings.baseUrl || 'Click to set base URL'}</span>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <Switch
            checked={provider.settings.enabled}
            onCheckedChange={onToggle}
            aria-label={`Toggle ${provider.name} provider`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default ProviderCard;
