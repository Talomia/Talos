import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('env-validation');

/**
 * Environment variable validation for Recurrsive.
 *
 * Validates that required environment variables are set based on the
 * deployment environment. Logs warnings for missing optional vars
 * and throws errors for missing required vars in production.
 */

interface EnvVar {
  name: string;
  required: 'always' | 'production' | 'optional';
  description: string;
}

const ENV_SCHEMA: EnvVar[] = [
  // Security
  { name: 'VAULT_SECRET', required: 'production', description: 'API key vault encryption secret' },

  // Auth
  { name: 'SUPABASE_URL', required: 'optional', description: 'Supabase project URL for auth' },
  { name: 'SUPABASE_PUBLISHABLE_KEY', required: 'optional', description: 'Supabase publishable key for auth' },

  // Monitoring
  { name: 'VITE_SENTRY_DSN', required: 'optional', description: 'Sentry error tracking DSN' },
  { name: 'VITE_POSTHOG_KEY', required: 'optional', description: 'PostHog analytics key' },
];

/**
 * Validates environment variables and logs results.
 * Call this at application startup.
 *
 * In production, throws an error if any required vars are missing.
 * In development, logs warnings only.
 */
export function validateEnv(env?: Record<string, string>): void {
  const isProduction = (env?.NODE_ENV || process.env.NODE_ENV) === 'production';
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  for (const { name, required, description } of ENV_SCHEMA) {
    const value = env?.[name] || process.env[name];
    const isSet = !!value && value !== '' && !value.startsWith('your_');

    if (!isSet) {
      const isRequired = required === 'always' || (required === 'production' && isProduction);

      if (isRequired) {
        missingRequired.push(`  ❌ ${name} — ${description}`);
      } else if (required !== 'optional') {
        missingOptional.push(`  ⚠️  ${name} — ${description}`);
      }
    }
  }

  if (missingOptional.length > 0) {
    logger.warn(`Missing optional environment variables:\n${missingOptional.join('\n')}`);
  }

  if (missingRequired.length > 0) {
    const message = `Missing REQUIRED environment variables:\n${missingRequired.join('\n')}`;

    if (isProduction) {
      logger.error(message);
      throw new Error(`Recurrsive cannot start: ${missingRequired.length} required env var(s) missing`);
    } else {
      logger.warn(`${message}\n  (Not enforced in development)`);
    }
  }

  if (missingRequired.length === 0 && missingOptional.length === 0) {
    logger.info('All environment variables validated ✓');
  }
}
