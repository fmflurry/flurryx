/**
 * Generic state wrapper for an async resource (e.g. an HTTP call).
 *
 * Every store slot holds a `ResourceState`. It starts as idle and transitions
 * through loading → success/error as the underlying operation progresses.
 *
 * @template T - The type of the data payload.
 *
 * @example
 * ```ts
 * // Initial (idle) state
 * { data: undefined, isLoading: false, status: undefined, errors: undefined }
 *
 * // Loading
 * { data: undefined, isLoading: true, status: undefined, errors: undefined }
 *
 * // Success
 * { data: product, isLoading: false, status: 'Success', errors: undefined }
 *
 * // Error
 * { data: undefined, isLoading: false, status: 'Error', errors: [{ code: '404', message: 'Not found' }] }
 * ```
 */
export interface ResourceState<T> {
  /** Whether the resource is currently being fetched. */
  isLoading?: boolean;
  /** The data payload. `undefined` until the first successful fetch. */
  data?: T;
  /** `'Success'` after a successful fetch, `'Error'` after a failure. `undefined` while idle or loading. */
  status?: "Success" | "Error";
  /** Normalized error array. Present only when `status` is `'Error'`. */
  errors?: Array<{
    code: string;
    message: string;
  }>;
}

/**
 * Union type accepted as a store key identifier.
 */
export type StoreEnum = string | number | symbol;
