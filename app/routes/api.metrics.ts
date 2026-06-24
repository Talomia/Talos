import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { withSecurity } from '~/lib/security';

/**
 * In-memory metrics collector for production monitoring.
 * Tracks request counts, error counts, and LLM usage per provider.
 *
 * NOTE: These metrics are per-instance and reset on deploy.
 * For multi-instance, aggregate via external collector (Prometheus, Datadog, etc.).
 */
interface MetricsState {
  startedAt: number;
  requests: Record<string, number>;
  errors: Record<string, number>;
  llmCalls: Record<string, { count: number; tokens: number; errors: number }>;
  latency: { sum: number; count: number; max: number };
}

const metrics: MetricsState = {
  startedAt: Date.now(),
  requests: {},
  errors: {},
  llmCalls: {},
  latency: { sum: 0, count: 0, max: 0 },
};

/**
 * Record an API request for metrics tracking.
 */
export function recordRequest(route: string): void {
  metrics.requests[route] = (metrics.requests[route] || 0) + 1;
}

/**
 * Record an API error for metrics tracking.
 */
export function recordError(route: string): void {
  metrics.errors[route] = (metrics.errors[route] || 0) + 1;
}

/**
 * Record an LLM API call for metrics tracking.
 */
export function recordLLMCall(provider: string, tokens: number, isError = false): void {
  if (!metrics.llmCalls[provider]) {
    metrics.llmCalls[provider] = { count: 0, tokens: 0, errors: 0 };
  }

  metrics.llmCalls[provider].count += 1;
  metrics.llmCalls[provider].tokens += tokens;

  if (isError) {
    metrics.llmCalls[provider].errors += 1;
  }
}

/**
 * Record request latency.
 */
export function recordLatency(ms: number): void {
  metrics.latency.sum += ms;
  metrics.latency.count += 1;
  metrics.latency.max = Math.max(metrics.latency.max, ms);
}

/**
 * GET /api/metrics
 *
 * Returns system metrics in Prometheus-compatible text format.
 * Requires authentication in production.
 *
 * Metrics exposed:
 * - talos_uptime_seconds: seconds since server start
 * - talos_requests_total: total requests by route
 * - talos_errors_total: total errors by route
 * - talos_llm_calls_total: LLM API calls by provider
 * - talos_llm_tokens_total: total tokens used by provider
 * - talos_llm_errors_total: LLM errors by provider
 * - talos_latency_avg_ms: average request latency
 * - talos_latency_max_ms: max request latency
 */
export const loader = withSecurity(
  async (_args: LoaderFunctionArgs) => {
    const uptimeSeconds = Math.floor((Date.now() - metrics.startedAt) / 1000);
    const avgLatency = metrics.latency.count > 0 ? Math.round(metrics.latency.sum / metrics.latency.count) : 0;

    const lines: string[] = [
      '# HELP talos_uptime_seconds Time since server start in seconds',
      '# TYPE talos_uptime_seconds gauge',
      `talos_uptime_seconds ${uptimeSeconds}`,
      '',
      '# HELP talos_requests_total Total API requests by route',
      '# TYPE talos_requests_total counter',
    ];

    for (const [route, count] of Object.entries(metrics.requests)) {
      lines.push(`talos_requests_total{route="${route}"} ${count}`);
    }

    lines.push('', '# HELP talos_errors_total Total API errors by route', '# TYPE talos_errors_total counter');

    for (const [route, count] of Object.entries(metrics.errors)) {
      lines.push(`talos_errors_total{route="${route}"} ${count}`);
    }

    lines.push(
      '',
      '# HELP talos_llm_calls_total Total LLM API calls by provider',
      '# TYPE talos_llm_calls_total counter',
    );

    for (const [provider, data] of Object.entries(metrics.llmCalls)) {
      lines.push(`talos_llm_calls_total{provider="${provider}"} ${data.count}`);
    }

    lines.push(
      '',
      '# HELP talos_llm_tokens_total Total tokens used by provider',
      '# TYPE talos_llm_tokens_total counter',
    );

    for (const [provider, data] of Object.entries(metrics.llmCalls)) {
      lines.push(`talos_llm_tokens_total{provider="${provider}"} ${data.tokens}`);
    }

    lines.push('', '# HELP talos_llm_errors_total LLM API errors by provider', '# TYPE talos_llm_errors_total counter');

    for (const [provider, data] of Object.entries(metrics.llmCalls)) {
      lines.push(`talos_llm_errors_total{provider="${provider}"} ${data.errors}`);
    }

    lines.push(
      '',
      '# HELP talos_latency_avg_ms Average request latency in milliseconds',
      '# TYPE talos_latency_avg_ms gauge',
      `talos_latency_avg_ms ${avgLatency}`,
      '',
      '# HELP talos_latency_max_ms Maximum request latency in milliseconds',
      '# TYPE talos_latency_max_ms gauge',
      `talos_latency_max_ms ${metrics.latency.max}`,
    );

    return new Response(lines.join('\n') + '\n', {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  },
  { requireAuth: true },
);
