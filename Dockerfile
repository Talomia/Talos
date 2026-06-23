# ---- build stage ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# CI-friendly env
ENV HUSKY=0
ENV CI=true

# Use pnpm
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Ensure git is available for build and runtime scripts
RUN apt-get update && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

# Accept (optional) build-time public URL for Remix/Vite (Coolify can pass it)
ARG VITE_PUBLIC_APP_URL
ENV VITE_PUBLIC_APP_URL=${VITE_PUBLIC_APP_URL}

# Install deps efficiently
COPY package.json pnpm-lock.yaml* ./
RUN pnpm fetch

# Copy source and build
COPY . .
# install with dev deps (needed to build)
RUN pnpm install --offline --frozen-lockfile

# Build the Remix app (SSR + client)
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
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Install curl for Docker API communication via unix socket
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml* ./
RUN pnpm fetch

COPY . .
RUN pnpm install --offline --frozen-lockfile

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
ENV WRANGLER_SEND_METRICS=false \
    VITE_LOG_LEVEL=${VITE_LOG_LEVEL} \
    DEFAULT_NUM_CTX=${DEFAULT_NUM_CTX} \
    RUNNING_IN_DOCKER=true

# Note: API keys should be provided at runtime via docker run -e or docker-compose
# Example: docker run -e OPENAI_API_KEY=your_key_here ...

# Install curl for healthchecks and copy bindings script
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

# Copy built files and scripts
COPY --from=prod-deps /app/build /app/build
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=prod-deps /app/package.json /app/package.json
COPY --from=prod-deps /app/bindings.sh /app/bindings.sh
# bindings.sh reads this to enumerate env var names for --binding flags
COPY --from=prod-deps /app/worker-configuration.d.ts /app/worker-configuration.d.ts
# Wrangler needs this for nodejs_compat flag and compatibility settings
COPY --from=prod-deps /app/wrangler.toml /app/wrangler.toml

# Run as non-root user for security
# Create appuser WITH a real home directory so corepack/pnpm can cache there
RUN addgroup --gid 1001 --system appuser && \
    adduser --uid 1001 --system --ingroup appuser --home /home/appuser appuser

# Pre-configure wrangler to disable metrics (under appuser's home)
RUN mkdir -p /home/appuser/.config/.wrangler && \
    echo '{"enabled":false}' > /home/appuser/.config/.wrangler/metrics.json && \
    chown -R appuser:appuser /home/appuser

# Give corepack a writable cache directory
ENV COREPACK_HOME=/home/appuser/.cache/corepack
RUN corepack enable

# Make bindings script executable
RUN chmod +x /app/bindings.sh

# Give Wrangler a writable tmp directory inside /app
RUN mkdir -p /app/.wrangler && chown appuser:appuser /app/.wrangler

EXPOSE 5173

# Healthcheck for deployment platforms
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 \
  CMD curl -fsS http://localhost:5173/ || exit 1

USER appuser

# Start using dockerstart script with Wrangler
CMD ["pnpm", "run", "dockerstart"]
