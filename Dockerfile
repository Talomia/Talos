# ---- build stage ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# CI-friendly env
ENV HUSKY=0
ENV CI=true

# Use pnpm — version MUST match package.json "packageManager" field
RUN corepack enable && corepack prepare pnpm@9.14.4 --activate

# Increase network timeouts for Docker builds behind proxies
ENV npm_config_fetch_retries=5
ENV npm_config_fetch_retry_mintimeout=20000
ENV npm_config_fetch_retry_maxtimeout=120000

# Ensure git is available for build and runtime scripts
RUN apt-get update && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

# Accept (optional) build-time public URL for Remix/Vite (Coolify can pass it)
ARG VITE_PUBLIC_APP_URL
ENV VITE_PUBLIC_APP_URL=${VITE_PUBLIC_APP_URL}

# Install deps
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm run build

# ---- production dependencies stage ----
FROM build AS prod-deps

# Keep only production deps for runtime
RUN pnpm prune --prod --ignore-scripts


# ---- development stage ----
# Usage: docker compose --profile development up
FROM build AS development

# Non-sensitive development arguments
ARG VITE_LOG_LEVEL=debug
ARG DEFAULT_NUM_CTX

# Set non-sensitive environment variables for development
ENV VITE_LOG_LEVEL=${VITE_LOG_LEVEL} \
    DEFAULT_NUM_CTX=${DEFAULT_NUM_CTX} \
    RUNNING_IN_DOCKER=true

# Note: API keys should be provided at runtime via docker run -e or docker-compose
# Example: docker run -e OPENAI_API_KEY=your_key_here ...

RUN mkdir -p /app/run

# Run as non-root user for security
RUN addgroup --gid 1001 --system appuser && \
    adduser --uid 1001 --system --ingroup appuser appuser
USER appuser

CMD ["pnpm", "run", "dev", "--host"]


# ---- runtime server stage ----
# WebSocket server for Docker-based code execution.
# Manages Docker sandbox containers — one per user session.
# Used when VITE_RUNTIME_ENGINE=docker for self-hosted/air-gapped deployments.
# Usage: docker compose --profile docker-engine up
FROM node:22-bookworm-slim AS runtime-server
WORKDIR /app

# Install pnpm and required tools
RUN corepack enable && corepack prepare pnpm@9.14.4 --activate

# Install curl for Docker API communication via unix socket
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
ENV RUNTIME_WS_PORT=3001
ENV RUNTIME_WS_HOST=0.0.0.0
ENV DOCKER_SOCKET=/var/run/docker.sock
ENV SANDBOX_IMAGE=node:22-slim
ENV LOG_LEVEL=debug

EXPOSE 3001

# Healthcheck: verify the WS server is accepting connections
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD curl -fsS http://localhost:3001/health || exit 1

# Run as root — required for Docker socket access
# In production, use Docker socket proxy for security
CMD ["npx", "tsx", "app/lib/runtime/engines/runtime-ws-server.ts"]


# ---- production stage (DEFAULT) ----
# This MUST be the last stage — EasyPanel and plain `docker build`
# always build the final stage when no --target is specified.
FROM prod-deps AS app-production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5173
ENV HOST=0.0.0.0

# Non-sensitive build arguments
ARG VITE_LOG_LEVEL=debug
ARG DEFAULT_NUM_CTX

# Set non-sensitive environment variables
ENV VITE_LOG_LEVEL=${VITE_LOG_LEVEL} \
    DEFAULT_NUM_CTX=${DEFAULT_NUM_CTX} \
    RUNNING_IN_DOCKER=true \
    NODE_ENV=production

# Note: API keys should be provided at runtime via docker run -e or docker-compose
# Example: docker run -e OPENAI_API_KEY=your_key_here ...

# Install curl and ca-certificates for healthchecks and TLS
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy built files and production server
COPY --from=prod-deps /app/build /app/build
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/package.json /app/package.json
COPY --from=prod-deps /app/server.production.mjs /app/server.production.mjs

# Run as non-root user for security
RUN addgroup --gid 1001 --system appuser && \
    adduser --uid 1001 --system --ingroup appuser --home /home/appuser appuser && \
    chown -R appuser:appuser /home/appuser

EXPOSE 5173

# Healthcheck for deployment platforms
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD curl -fsS http://localhost:5173/health || exit 1

USER appuser

# Start Node.js production server
CMD ["node", "server.production.mjs"]
