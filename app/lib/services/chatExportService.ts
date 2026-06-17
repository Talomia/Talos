import { type Message } from 'ai';
import { getAllChats, deleteChat } from '~/lib/persistence/db';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ChatExportService');

interface ExtendedMessage extends Message {
  name?: string;
  function_call?: Record<string, unknown>;
  timestamp?: number;
}

/**
 * Export all chats to a JSON file
 * @param db The IndexedDB database instance
 * @returns A promise that resolves to the export data
 */
export async function exportAllChats(
  db: IDBDatabase,
): Promise<{ chats: Array<Record<string, unknown>>; exportDate: string }> {
  if (!db) {
    throw new Error('Database not initialized');
  }

  try {
    // Get all chats from the database using the getAllChats helper
    const chats = await getAllChats(db);

    // Validate and sanitize each chat before export
    const sanitizedChats = chats.map((chat) => ({
      id: chat.id,
      description: chat.description || '',
      messages: chat.messages.map((msg: ExtendedMessage) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        name: msg.name,
        function_call: msg.function_call,
        timestamp: msg.timestamp,
      })),
      timestamp: chat.timestamp,
      urlId: chat.urlId || null,
      metadata: chat.metadata || null,
    }));

    logger.debug(`Successfully prepared ${sanitizedChats.length} chats for export`);

    return {
      chats: sanitizedChats,
      exportDate: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Error exporting chats:', error);
    throw new Error(`Failed to export chats: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete all chats from the database
 * @param db The IndexedDB database instance
 */
export async function deleteAllChats(db: IDBDatabase): Promise<void> {
  // Clear chat history from localStorage
  localStorage.removeItem('bolt_chat_history');

  // Clear chats from IndexedDB
  if (!db) {
    throw new Error('Database not initialized');
  }

  // Get all chats and delete them one by one
  const chats = await getAllChats(db);
  const deletePromises = chats.map((chat) => deleteChat(db, chat.id));
  await Promise.all(deletePromises);
}
