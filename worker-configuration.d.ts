interface Env {
  // Runtime configuration
  RUNNING_IN_DOCKER: string;
  DEFAULT_NUM_CTX: string;

  // LLM Provider API keys
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY: string;
  GROQ_API_KEY: string;
  HuggingFace_API_KEY: string;
  OPEN_ROUTER_API_KEY: string;
  OLLAMA_API_BASE_URL: string;
  OPENAI_LIKE_API_KEY: string;
  OPENAI_LIKE_API_BASE_URL: string;
  OPENAI_LIKE_API_MODELS: string;
  TOGETHER_API_KEY: string;
  TOGETHER_API_BASE_URL: string;
  DEEPSEEK_API_KEY: string;
  LMSTUDIO_API_BASE_URL: string;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  MISTRAL_API_KEY: string;
  XAI_API_KEY: string;
  PERPLEXITY_API_KEY: string;
  AWS_BEDROCK_CONFIG: string;

  // Cloudflare Pages environment
  CF_PAGES?: string;
  CF_PAGES_URL?: string;
  CF_PAGES_COMMIT_SHA?: string;

  // GitHub bug report integration
  GITHUB_BUG_REPORT_TOKEN?: string;
  BUG_REPORT_REPO?: string;

  // Allow index access for dynamic env lookups
  [key: string]: string | undefined;
}
