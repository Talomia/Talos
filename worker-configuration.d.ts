interface Env {
  // Runtime configuration
  RUNNING_IN_DOCKER: string;
  DEFAULT_NUM_CTX: string;
  VITE_LOG_LEVEL: string;

  // Security
  VAULT_SECRET: string;

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
  COHERE_API_KEY: string;
  HYPERBOLIC_API_KEY: string;
  CEREBRAS_API_KEY: string;
  FIREWORKS_API_KEY: string;
  GITHUB_API_KEY: string;

  // Cloudflare Pages environment
  CF_PAGES?: string;
  CF_PAGES_URL?: string;
  CF_PAGES_COMMIT_SHA?: string;

  // GitHub bug report integration
  GITHUB_BUG_REPORT_TOKEN?: string;
  BUG_REPORT_REPO?: string;

  // Supabase Platform Auth
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;

  // Supabase client-side (VITE_ prefix)
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
  VITE_SUPABASE_ACCESS_TOKEN: string;

  // Integration tokens
  VITE_GITHUB_ACCESS_TOKEN: string;
  VITE_GITHUB_TOKEN_TYPE: string;
  VITE_GITLAB_ACCESS_TOKEN: string;
  VITE_GITLAB_URL: string;
  VITE_VERCEL_ACCESS_TOKEN: string;
  VITE_NETLIFY_ACCESS_TOKEN: string;

  // Monitoring
  VITE_SENTRY_DSN: string;
  VITE_POSTHOG_KEY: string;
  VITE_APP_VERSION: string;

  // Allow index access for dynamic env lookups
  [key: string]: string | undefined;
}
