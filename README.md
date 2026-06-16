# Recurrsive

**Build Recursively. Ship Infinitely.**

Recurrsive is an AI-native platform for generating, iterating, and deploying full-stack web applications using natural language. Describe what you want, and Recurrsive builds it — live, in your browser.

## Features

- **Natural Language → Full-Stack Apps** — Describe your app in plain English and watch it materialize in real-time
- **Multi-Model Support** — Use any LLM: OpenAI, Anthropic, Google Gemini, Ollama (local), Groq, Mistral, DeepSeek, and 15+ more providers
- **In-Browser Development** — Full development environment with file system, terminal, and live preview via WebContainers
- **Secure API Key Management** — AES-256-GCM encrypted vault for all provider keys, stored in HttpOnly cookies
- **Authentication** — Optional Supabase Auth with email/password and OAuth (GitHub, Google)
- **Cloud Sync** — Local-first persistence with optional server-side sync via Supabase PostgreSQL
- **Deploy Anywhere** — Push to GitHub, deploy to Vercel, Netlify, or Cloudflare directly from the UI

## Quick Start

### Prerequisites
- Node.js 20+
- pnpm 9+

### Local Development

```bash
# Clone the repository
git clone https://github.com/h-khalid-h/recurrsive.git
cd recurrsive

# Install dependencies
pnpm install

# Copy environment config
cp .env.example .env.local

# Start dev server
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173)

### Docker

```bash
# Development
docker compose --profile development up

# Production
docker compose --profile production up
```

## Configuration

### Required (Production)

| Variable | Description |
|----------|-------------|
| `VAULT_SECRET` | Encryption secret for API key vault (32+ chars) |

### Optional — Authentication

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon key |

### Optional — Monitoring

| Variable | Description |
|----------|-------------|
| `VITE_SENTRY_DSN` | Sentry error tracking DSN |
| `VITE_POSTHOG_KEY` | PostHog analytics key |

### AI Provider Keys

Set any provider API key to enable it. See [`.env.example`](.env.example) for the full list of supported providers.

## Architecture

```
app/
├── components/        # React components
│   ├── auth/          # Login/signup dialog
│   ├── chat/          # Chat interface
│   ├── header/        # App header
│   └── workbench/     # Code editor + preview
├── lib/
│   ├── .server/       # Server-only code (Cloudflare Workers)
│   │   ├── crypto.ts        # AES-256-GCM encryption
│   │   ├── api-key-vault.ts # Encrypted API key storage
│   │   ├── supabase.ts      # Auth server client
│   │   └── persistence.ts   # Database CRUD
│   ├── monitoring/    # Sentry + PostHog (lazy-loaded)
│   ├── persistence/   # IndexedDB + cloud sync
│   └── stores/        # nanostores state management
├── routes/            # Remix API routes
│   ├── api.auth.ts          # Authentication
│   ├── api.chat.ts          # LLM streaming
│   ├── api.keys.ts          # API key vault CRUD
│   ├── api.projects.ts      # Project persistence
│   └── api.health.ts        # Health check
└── utils/             # Shared utilities
```

## Deployment

### Cloudflare Pages (Recommended)

```bash
pnpm deploy
```

Or via CI/CD — push to `main` for staging, `stable` for production. See [`.github/workflows/deploy.yaml`](.github/workflows/deploy.yaml).

### Environment Variables

Set secrets via Cloudflare dashboard or CLI:
```bash
wrangler pages secret put VAULT_SECRET
wrangler pages secret put SUPABASE_URL
wrangler pages secret put SUPABASE_PUBLISHABLE_KEY
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm deploy` | Build + deploy to Cloudflare Pages |
| `pnpm test` | Run test suite |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript type checking |

## Security

- **API Keys**: AES-256-GCM encrypted, stored in HttpOnly/SameSite cookies
- **Authentication**: Supabase Auth with server-side session management
- **Data Isolation**: Row-Level Security (RLS) on all database tables
- **Non-root Docker**: Runs as unprivileged user in containers
- **CI Security**: CodeQL analysis, dependency audits, secrets detection

## License

[MIT](LICENSE)
