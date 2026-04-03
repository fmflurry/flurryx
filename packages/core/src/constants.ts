/**
 * Sentinel value indicating the cache should never expire.
 * Pass to `@SkipIfCached` `timeoutMs` parameter to disable TTL-based invalidation.
 *
 * @example
 * ```ts
 * @SkipIfCached('LIST', (i) => i.store, false, CACHE_NO_TIMEOUT)
 * ```
 */
export const CACHE_NO_TIMEOUT = Infinity;

/**
 * Default cache time-to-live in milliseconds: **5 minutes** (300 000 ms).
 * Used by `@SkipIfCached` when no `timeoutMs` is provided.
 */
export const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
