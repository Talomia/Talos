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
  Cohere: 8192, // Command R+ supports 8k output
  DeepSeek: 16384, // DeepSeek V3 supports 16k output
  Groq: 32768, // Llama 3.3 70B on Groq supports 32k output
  HuggingFace: 16384, // Varies by model; 16k covers most modern models
  Mistral: 8192,
  Ollama: 16384, // Local models benefit from higher ceiling
  OpenRouter: 64000, // Routes to Claude/GPT/Gemini — use their native limits
  Perplexity: 16384, // Sonar models support 16k+ output
  Together: 32768, // Llama/Mixtral on Together support 32k output
  xAI: 32768, // Grok-2 supports 32k output
  LMStudio: 16384, // Local models benefit from higher ceiling
  OpenAILike: 16384, // Conservative default for unknown API-compatible providers
  AmazonBedrock: 16384, // Nova Pro supports 16k; Claude via Bedrock uses Anthropic limit
  Hyperbolic: 16384,
  Fireworks: 16384, // Llama/Mixtral models support 16k+
  Cerebras: 16384, // Fast inference; 16k covers most models
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
export const MAX_RESPONSE_SEGMENTS = 8;

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
