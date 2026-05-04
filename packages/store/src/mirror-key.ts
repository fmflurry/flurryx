import type { KeyedResourceKey } from "@flurryx/core";
import type { IStore, StoreDataShape, StoreKey } from "./types";

interface CacheInvalidationTarget<TData extends StoreDataShape<TData>> {
  invalidateCacheFor(key: StoreKey<TData>): void;
  invalidateCacheFor(key: StoreKey<TData>, resourceKey: KeyedResourceKey): void;
}

/**
 * Options for {@link mirrorKey}.
 */
export interface MirrorOptions {
  /**
   * Angular `DestroyRef` (or any object with an `onDestroy` method) for
   * automatic cleanup. When provided, the mirror stops when the ref is destroyed.
   */
  destroyRef?: { onDestroy: (fn: () => void) => void };

  /**
   * Mirrors updates in both directions by default (`bidirectional`).
   * Set to `source-to-target` for one-way mirroring (source → target only).
   *
   * @default "bidirectional"
   */
  direction?: "source-to-target" | "bidirectional";
}

/**
 * Mirrors a resource key between two stores. Bidirectional by default —
 * when either side updates, the other receives the same state.
 * A guard flag prevents infinite update loops.
 *
 * Set `options.direction` to `"source-to-target"` for one-way mirroring.
 *
 * @param source - The store to mirror from
 * @param sourceKey - The key to watch on the source store
 * @param target - The store to mirror to
 * @param targetKeyOrOptions - Either the target key name or options (defaults source key)
 * @param options - Mirror options (direction, destroyRef)
 * @returns Cleanup function to stop mirroring
 */
export function mirrorKey<
  TSource extends StoreDataShape<TSource>,
  TTarget extends StoreDataShape<TTarget>
>(
  source: IStore<TSource>,
  sourceKey: StoreKey<TSource>,
  target: IStore<TTarget>,
  targetKeyOrOptions?: StoreKey<TTarget> | MirrorOptions,
  options?: MirrorOptions
): () => void {
  const resolvedTargetKey = (
    typeof targetKeyOrOptions === "string" ? targetKeyOrOptions : sourceKey
  ) as StoreKey<TTarget>;

  const resolvedOptions =
    typeof targetKeyOrOptions === "object" ? targetKeyOrOptions : options;

  const direction = resolvedOptions?.direction ?? "bidirectional";

  let forwarding = false;

  // source → target (always)
  const updateCleanup = source.onUpdate(sourceKey, (state) => {
    if (forwarding) return;
    if (direction === "bidirectional") forwarding = true;
    try {
      target.update(
        resolvedTargetKey,
        state as unknown as Partial<TTarget[StoreKey<TTarget>]>
      );
    } finally {
      if (direction === "bidirectional") forwarding = false;
    }
  });

  const invalidateCleanup = source.onCacheInvalidate(sourceKey, (event) => {
    if (forwarding) return;
    if (direction === "bidirectional") forwarding = true;
    try {
      const invalidationTarget = target as unknown as CacheInvalidationTarget<TTarget>;
      if (event.resourceKey === undefined) {
        invalidationTarget.invalidateCacheFor(resolvedTargetKey);
        return;
      }
      invalidationTarget.invalidateCacheFor(resolvedTargetKey, event.resourceKey);
    } finally {
      if (direction === "bidirectional") forwarding = false;
    }
  });

  // target → source (bidirectional only)
  let reverseUpdateCleanup: (() => void) | undefined;
  let reverseInvalidateCleanup: (() => void) | undefined;

  if (direction === "bidirectional") {
    reverseUpdateCleanup = target.onUpdate(resolvedTargetKey, (state) => {
      if (forwarding) return;
      forwarding = true;
      try {
        source.update(
          sourceKey,
          state as unknown as Partial<TSource[StoreKey<TSource>]>
        );
      } finally {
        forwarding = false;
      }
    });

    reverseInvalidateCleanup = target.onCacheInvalidate(resolvedTargetKey, (event) => {
      if (forwarding) return;
      forwarding = true;
      try {
        const invalidationTarget = source as unknown as CacheInvalidationTarget<TSource>;
        if (event.resourceKey === undefined) {
          invalidationTarget.invalidateCacheFor(sourceKey);
          return;
        }
        invalidationTarget.invalidateCacheFor(sourceKey, event.resourceKey);
      } finally {
        forwarding = false;
      }
    });
  }

  const cleanup = () => {
    updateCleanup();
    invalidateCleanup();
    reverseUpdateCleanup?.();
    reverseInvalidateCleanup?.();
  };

  if (resolvedOptions?.destroyRef) {
    resolvedOptions.destroyRef.onDestroy(cleanup);
  }

  return cleanup;
}
