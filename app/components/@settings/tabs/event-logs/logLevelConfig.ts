export interface SelectOption {
  value: string;
  label: string;
  icon?: string;
  color?: string;
}

export const logLevelOptions: SelectOption[] = [
  {
    value: 'all',
    label: 'All Types',
    icon: 'i-ph:funnel',
    color: '#9333ea',
  },
  {
    value: 'provider',
    label: 'LLM',
    icon: 'i-ph:robot',
    color: '#10b981',
  },
  {
    value: 'api',
    label: 'API',
    icon: 'i-ph:cloud',
    color: '#3b82f6',
  },
  {
    value: 'error',
    label: 'Errors',
    icon: 'i-ph:warning-circle',
    color: '#ef4444',
  },
  {
    value: 'warning',
    label: 'Warnings',
    icon: 'i-ph:warning',
    color: '#f59e0b',
  },
  {
    value: 'info',
    label: 'Info',
    icon: 'i-ph:info',
    color: '#3b82f6',
  },
  {
    value: 'debug',
    label: 'Debug',
    icon: 'i-ph:bug',
    color: '#6b7280',
  },
];
