import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DataOperationUtils');

/**
 * Download data as a JSON file by creating a blob URL and triggering a download.
 * @param data The data to serialize and download
 * @param filename The name of the downloaded file
 */
export function downloadJsonFile(data: unknown, filename: string): void {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    logger.error('Error downloading JSON file:', error);
    throw error;
  }
}
