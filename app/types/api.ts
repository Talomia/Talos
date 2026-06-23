/**
 * Standardized API response types.
 * All API routes should use these types for consistent response shapes.
 */

/** Success response wrapper */
export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  timestamp?: number;
}

/** Error response wrapper */
export interface ApiError {
  success: false;
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

/** Union type for all API responses */
export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

/** Paginated response */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Helper to create success responses */
export function apiSuccess<T>(data: T): ApiSuccess<T> {
  return { success: true, data, timestamp: Date.now() };
}

/** Helper to create error responses */
export function apiError(error: string, code?: string, details?: Record<string, unknown>): ApiError {
  return { success: false, error, ...(code && { code }), ...(details && { details }) };
}
