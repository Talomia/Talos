import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('APIKeyService');

/**
 * Import API keys from a JSON file.
 * Keys are stored in the server-side encrypted vault via /api/keys.
 * @param keys The API keys to import
 * @returns The normalized keys that were imported (for display purposes only)
 */
export async function importAPIKeys(keys: Record<string, unknown>): Promise<Record<string, string>> {
  const importedKeys: Record<string, string> = {};

  for (const [key, value] of Object.entries(keys)) {
    // Skip comment fields
    if (key.startsWith('_')) {
      continue;
    }

    // Skip base URL fields (they should be set in .env.local)
    if (key.includes('_API_BASE_URL')) {
      continue;
    }

    if (typeof value !== 'string' || !value) {
      continue;
    }

    // Handle both old and new template formats
    let normalizedKey = key;

    // Check if this is the old format (e.g., "Anthropic_API_KEY")
    if (key.includes('_API_KEY')) {
      normalizedKey = key.replace('_API_KEY', '');
    }

    // Store key in encrypted vault
    try {
      await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: normalizedKey, apiKey: value }),
      });
      importedKeys[normalizedKey] = value;
    } catch (error) {
      logger.error(`Failed to import key for ${normalizedKey}:`, error);
    }
  }

  return importedKeys;
}

/**
 * Create an API keys template
 * @returns The API keys template
 */
export function createAPIKeysTemplate(): Record<string, string> {
  /*
   * Create a template with provider names as keys
   * This matches how the application stores API keys in cookies
   */
  const template: Record<string, string> = {
    Anthropic: '',
    OpenAI: '',
    Google: '',
    Groq: '',
    HuggingFace: '',
    OpenRouter: '',
    Deepseek: '',
    Mistral: '',
    OpenAILike: '',
    Together: '',
    xAI: '',
    Perplexity: '',
    Cohere: '',
    AzureOpenAI: '',
  };

  // Add a comment to explain the format
  return {
    _comment:
      "Fill in your API keys for each provider. Keys will be stored with the provider name (e.g., 'OpenAI'). The application also supports the older format with keys like 'OpenAI_API_KEY' for backward compatibility.",
    ...template,
  };
}
