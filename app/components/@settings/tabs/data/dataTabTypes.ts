import type { Chat } from '~/lib/persistence/db';

// Extend the Chat interface to include the missing properties
export interface ExtendedChat extends Chat {
  title?: string;
  updatedAt?: number;
}

export interface SettingsCategory {
  id: string;
  label: string;
  description: string;
}

export interface ChatItem {
  id: string;
  label: string;
  description: string;
}

// Helper function to create a chat label and description
export function createChatItem(chat: Chat): ChatItem {
  return {
    id: chat.id,

    // Use description as title if available, or format a short ID
    label: (chat as ExtendedChat).title || chat.description || `Chat ${chat.id.slice(0, 8)}`,

    // Format the description with message count and timestamp
    description: `${chat.messages.length} messages - Last updated: ${new Date((chat as ExtendedChat).updatedAt || Date.parse(chat.timestamp)).toLocaleString()}`,
  };
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  { id: 'core', label: 'Core Settings', description: 'User profile and main settings' },
  { id: 'providers', label: 'Providers', description: 'API keys and provider configurations' },
  { id: 'features', label: 'Features', description: 'Feature flags and settings' },
  { id: 'ui', label: 'UI', description: 'UI configuration and preferences' },
  { id: 'connections', label: 'Connections', description: 'External service connections' },
  { id: 'debug', label: 'Debug', description: 'Debug settings and logs' },
  { id: 'updates', label: 'Updates', description: 'Update settings and notifications' },
];
