/*
 * Security (rate limiting, headers) is inherited — the loader in api.models.ts
 * is already wrapped with withSecurity.
 */
import { loader } from './api.models';
export { loader };
