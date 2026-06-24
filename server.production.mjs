/**
 * Talos Production Server
 *
 * Replaces wrangler/workerd with a proper Node.js server.
 * This eliminates workerd's TLS certificate issues with external APIs
 * (OpenAI, Anthropic, Supabase, etc.) since Node.js trusts all standard CAs.
 *
 * The server injects `context.cloudflare.env` from `process.env` so all
 * existing code that reads `context.cloudflare.env.OPENAI_API_KEY` etc.
 * continues to work unchanged.
 */

// Load .env files BEFORE anything else so process.env is populated
// In production Docker, env vars come from the container environment and dotenv is pruned.
try {
  const dotenv = await import('dotenv');
  dotenv.config({ path: '.env.local' });
  dotenv.config({ path: '.env' });
} catch (e) {
  // dotenv is not installed in production, which is expected.
}

// Node.js 20 lacks native WebSocket — polyfill with the `ws` package
// so Supabase Realtime and other libraries work correctly
import { WebSocket } from 'ws';
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

import express from 'express';
import compression from 'compression';
import morgan from 'morgan';
import { createRequestHandler } from '@remix-run/express';

const PORT = parseInt(process.env.PORT || '5173', 10);
const isProduction = process.env.NODE_ENV === 'production';

// Import the Remix server build
const build = await import('./build/server/index.js');

const app = express();

// ─── Middleware ──────────────────────────────────────────────

// Gzip/Brotli compression
app.use(compression());

// Request logging
app.use(morgan(isProduction ? 'combined' : 'dev'));

// WebContainer requires these headers for SharedArrayBuffer
// credentialless (not require-corp) allows cross-origin resources like CDN scripts to load
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

// ─── Static Files ───────────────────────────────────────────

// Hashed assets (immutable — cached forever)
app.use(
  '/assets',
  express.static('build/client/assets', {
    immutable: true,
    maxAge: '1y',
  }),
);

// Other static files (favicon, social preview, etc. — short cache)
app.use(express.static('build/client', { maxAge: '1h' }));

// ─── Health Check ───────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
    },
  });
});

// ─── Remix Handler ──────────────────────────────────────────

app.all(
  '*',
  createRequestHandler({
    build,
    mode: isProduction ? 'production' : 'development',
    getLoadContext() {
      // Inject process.env as context.cloudflare.env so all existing
      // server-side code (loaders, actions) works unchanged
      return {
        cloudflare: {
          env: process.env,
        },
      };
    },
  }),
);

// ─── Start ──────────────────────────────────────────────────

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[talos] Production server ready on http://0.0.0.0:${PORT}`);
  console.log(`[talos] Environment: ${process.env.NODE_ENV || 'development'}`);
});

// ─── Graceful Shutdown ──────────────────────────────────────

function gracefulShutdown(signal) {
  console.log(`[talos] Received ${signal}, shutting down gracefully...`);

  server.close(() => {
    console.log('[talos] Server closed. Exiting.');
    process.exit(0);
  });

  // Force exit if server doesn't close within 10 seconds
  setTimeout(() => {
    console.error('[talos] Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
