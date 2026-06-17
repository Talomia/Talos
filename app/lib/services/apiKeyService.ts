import Cookies from 'js-cookie';

/**
 * Import API keys from a JSON file
 * @param keys The API keys to import
 */
export function importAPIKeys(keys: Record<string, unknown>): Record<string, string> {
  // Get existing keys from cookies
  const existingKeys = (() => {
    const storedApiKeys = Cookies.get('apiKeys');
    return storedApiKeys ? JSON.parse(storedApiKeys) : {};
  })();

  // Validate and save each key
  const newKeys: Record<string, string> = { ...existingKeys };
  Object.entries(keys).forEach(([key, value]) => {
    // Skip comment fields
    if (key.startsWith('_')) {
      return;
    }

    // Skip base URL fields (they should be set in .env.local)
    if (key.includes('_API_BASE_URL')) {
      return;
    }

    if (typeof value !== 'string') {
      throw new Error(`Invalid value for key: ${key}`);
    }

    // Handle both old and new template formats
    let normalizedKey = key;

    // Check if this is the old format (e.g., "Anthropic_API_KEY")
    if (key.includes('_API_KEY')) {
      // Extract the provider name from the old format
      normalizedKey = key.replace('_API_KEY', '');
    }

    /*
     * Only add non-empty keys
     * Use the normalized key in the correct format
     * (e.g., "OpenAI", "Google", "Anthropic")
     */
    if (value) {
      newKeys[normalizedKey] = value;
    }
  });

  return newKeys;
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
