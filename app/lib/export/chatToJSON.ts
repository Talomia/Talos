import type { Message } from 'ai';
import { format } from 'date-fns';

/**
 * Chat export data structure for JSON format.
 * This is the canonical format for re-importing conversations.
 */
export interface ChatExportData {
  /** Export format version for forward compatibility. */
  version: 1;

  /** ISO timestamp of when the export was created. */
  exportedAt: string;

  /** Application identifier. */
  source: 'talos';

  /** Chat metadata. */
  chat: {
    title: string;
    messageCount: number;
    createdAt?: string;
  };

  /** The conversation messages. */
  messages: ExportedMessage[];
}

interface ExportedMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
}

/**
 * Converts chat messages to a structured JSON export format.
 * Strips internal metadata (model/provider tags) and hidden annotations.
 */
export function chatToJSON(messages: Message[], title?: string): ChatExportData {
  const exportedMessages: ExportedMessage[] = [];

  for (const message of messages) {
    if (message.annotations?.includes('hidden')) {
      continue;
    }

    const content = typeof message.content === 'string' ? message.content : extractTextContent(message.content);

    // Clean up internal model/provider metadata tags
    const cleaned = content
      .replace(/\[Model: [^\]]+\]/g, '')
      .replace(/\[Provider: [^\]]+\]/g, '')
      .trim();

    if (!cleaned) {
      continue;
    }

    const exported: ExportedMessage = {
      role: message.role as ExportedMessage['role'],
      content: cleaned,
    };

    if (message.createdAt) {
      try {
        const date = new Date(message.createdAt);

        if (!isNaN(date.getTime())) {
          exported.createdAt = date.toISOString();
        }
      } catch {
        // invalid date — omit
      }
    }

    exportedMessages.push(exported);
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: 'talos',
    chat: {
      title: title || 'Untitled Chat',
      messageCount: exportedMessages.length,
    },
    messages: exportedMessages,
  };
}

function extractTextContent(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((item) => item.type === 'text')
    .map((item) => item.text || '')
    .join('\n');
}

/**
 * Downloads a chat as a JSON file.
 */
export function downloadChatAsJSON(messages: Message[], title?: string) {
  const data = chatToJSON(messages, title);
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(title || 'chat').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
