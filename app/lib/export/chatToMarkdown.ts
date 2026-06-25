import type { Message } from 'ai';
import { format } from 'date-fns';

/**
 * Converts a chat conversation to a formatted Markdown document.
 */
export function chatToMarkdown(messages: Message[], title?: string): string {
  const now = format(new Date(), 'MMMM d, yyyy h:mm a');
  const lines: string[] = [];

  // Header
  lines.push(`# ${title || 'Chat Conversation'}`);
  lines.push('');
  lines.push(`> Exported from Talos on ${now}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const message of messages) {
    if (Array.isArray(message.annotations) && message.annotations.includes('hidden')) {
      continue;
    }

    const role = message.role === 'user' ? '👤 You' : '🤖 Assistant';

    let timestamp = '';

    try {
      if (message.createdAt) {
        const date = new Date(message.createdAt);

        if (!isNaN(date.getTime())) {
          timestamp = format(date, 'h:mm a');
        }
      }
    } catch {
      // invalid date
    }

    const content = typeof message.content === 'string' ? message.content : extractTextContent(message.content);

    // Clean up model/provider metadata
    const cleaned = content
      .replace(/\[Model: [^\]]+\]/g, '')
      .replace(/\[Provider: [^\]]+\]/g, '')
      .trim();

    // Skip messages with empty content after cleaning
    if (!cleaned) {
      continue;
    }

    lines.push(`## ${role}${timestamp ? ` — ${timestamp}` : ''}`);
    lines.push('');
    lines.push(cleaned);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function extractTextContent(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((item) => item.type === 'text')
    .map((item) => item.text || '')
    .join('\n');
}

/**
 * Downloads a chat as a Markdown file.
 */
export function downloadChatAsMarkdown(messages: Message[], title?: string) {
  const markdown = chatToMarkdown(messages, title);
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(title || 'chat').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}-${format(new Date(), 'yyyy-MM-dd')}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
