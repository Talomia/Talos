/*
 * Maximum tokens for response generation (updated for modern model capabilities)
 * This serves as a fallback when model-specific limits are unavailable
 * Modern models like Claude 3.5, GPT-4o, and Gemini Pro support 128k+ tokens
 */
export const MAX_TOKENS = 128000;

/*
 * Provider-specific default completion token limits.
 * Used as fallbacks when model doesn't specify maxCompletionTokens.
 * Set to practical maximums for complete app generation (not the API minimum).
 */
export const PROVIDER_COMPLETION_LIMITS: Record<string, number> = {
  OpenAI: 16384, // GPT-4o supports 16k output; o1/o3 set via model config
  Github: 16384, // GitHub Models mirror OpenAI capabilities
  Anthropic: 64000, // Claude 4 Sonnet: 64k, Opus: 32k (use higher)
  Google: 65536, // Gemini 2.5 Pro/Flash support up to 65k output
  Cohere: 4000,
  DeepSeek: 8192,
  Groq: 8192,
  HuggingFace: 8192, // Varies by model; 8k is a safe middle ground
  Mistral: 8192,
  Ollama: 8192,
  OpenRouter: 16384, // Routes to many models; 16k covers most
  Perplexity: 8192,
  Together: 8192,
  xAI: 16384, // Grok supports 16k+ output
  LMStudio: 8192,
  OpenAILike: 8192,
  AmazonBedrock: 8192,
  Hyperbolic: 8192,
};

/*
 * Reasoning models that require maxCompletionTokens instead of maxTokens.
 * These models use internal reasoning tokens and have different API parameter requirements.
 *
 * Covers:
 *   - OpenAI: o1, o3, gpt-5
 *   - DeepSeek: deepseek-reasoner, deepseek-r1
 *   - Perplexity: *-reasoning-*
 *   - Google: gemini-2.5-* (uses thinkingConfig)
 *   - QwQ and other reasoning-named models
 */
export function isReasoningModel(modelName: string): boolean {
  const lower = modelName.toLowerCase();

  return (
    /^(o1|o3|gpt-5)/i.test(modelName) ||
    lower.includes('deepseek-reasoner') ||
    lower.includes('deepseek-r1') ||
    lower.includes('-reasoning-') ||
    lower.includes('qwq') ||
    lower.startsWith('gemini-2.5')
  );
}

/*
 * Limits the number of model responses that can be returned in a single request.
 * Set to 5 to support large, complete applications that span many files.
 */
export const MAX_RESPONSE_SEGMENTS = 5;

export interface File {
  type: 'file';
  content: string;
  isBinary: boolean;
  isLocked?: boolean;
  lockedByFolder?: string;
}

export interface Folder {
  type: 'folder';
  isLocked?: boolean;
  lockedByFolder?: string;
}

type Dirent = File | Folder;

export type FileMap = Record<string, Dirent | undefined>;

export const IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  '.next/**',
  'coverage/**',
  '.cache/**',
  '.vscode/**',
  '.idea/**',
  '**/*.log',
  '**/.DS_Store',
  '**/npm-debug.log*',
  '**/yarn-debug.log*',
  '**/yarn-error.log*',
  '**/*lock.json',
  '**/*lock.yml',
];
