import type { IStore, StoreDataShape, StoreKey } from "./types";

/**
 * Options for {@link mirrorKey}.
 */
export interface MirrorOptions {
  /**
   * Angular `DestroyRef` (or any object with an `onDestroy` method) for
   * automatic cleanup. When provided, the mirror stops when the ref is destroyed.
   */
  destroyRef?: { onDestroy: (fn: () => void) => void };
}

/**
 * Mirrors a resource key from a source store to a target store.
 * When the source key updates, the target key is updated with the same state.
 *
 * @param source - The store to mirror from
 * @param sourceKey - The key to watch on the source store
 * @param target - The store to mirror to
 * @param targetKeyOrOptions - Either the target key name or options (defaults source key)
 * @param options - Mirror options when a target key is provided
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

  const cleanup = source.onUpdate(sourceKey, (state) => {
    target.update(
      resolvedTargetKey,
      state as unknown as Partial<TTarget[StoreKey<TTarget>]>
    );
  });

  if (resolvedOptions?.destroyRef) {
    resolvedOptions.destroyRef.onDestroy(cleanup);
  }

  return cleanup;
}
