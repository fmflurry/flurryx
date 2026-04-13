import type { ResourceState } from "@flurryx/core";
import type {
  IStore,
  StoreDataShape,
  StoreKey,
  StoreResourceValue,
} from "./types";

/**
 * Options for {@link deriveKey}.
 */
export interface DeriveOptions<
  TSource extends StoreDataShape<TSource>,
  TSourceKey extends StoreKey<TSource>,
  TTargetValue,
> {
  /**
   * Maps the source slot's `data` payload into the target slot's `data` payload.
   */
  mapData: (
    data: StoreResourceValue<TSource, TSourceKey> | undefined,
    state: TSource[TSourceKey],
  ) => TTargetValue;
  /**
   * Angular `DestroyRef` (or any object with an `onDestroy` method) for
   * automatic cleanup. When provided, derivation stops when the ref is destroyed.
   */
  destroyRef?: { onDestroy: (fn: () => void) => void };
}

/**
 * Derives a resource key from another resource key.
 *
 * When the source key changes, the target key is updated with:
 * - `data`: the value returned by `mapData`
 * - `isLoading`, `status`, `errors`: mirrored from the source state
 *
 * @param source - The store to derive from
 * @param sourceKey - The key to watch on the source store
 * @param target - The store to write the derived state to
 * @param targetKey - The key to write to on the target store
 * @param options - Derivation options including the required `mapData`
 * @returns Cleanup function to stop deriving
 */
export function deriveKey<
  TSource extends StoreDataShape<TSource>,
  TSourceKey extends StoreKey<TSource>,
  TTarget extends StoreDataShape<TTarget>,
  TTargetKey extends StoreKey<TTarget>,
>(
  source: IStore<TSource>,
  sourceKey: TSourceKey,
  target: IStore<TTarget>,
  targetKey: TTargetKey,
  options: DeriveOptions<
    TSource,
    TSourceKey,
    StoreResourceValue<TTarget, TTargetKey>
  >,
): () => void {
  const cleanup = source.onUpdate(sourceKey, (state) => {
    const nextData = options.mapData(
      state.data as StoreResourceValue<TSource, TSourceKey> | undefined,
      state,
    );

    const nextState: Partial<ResourceState<StoreResourceValue<TTarget, TTargetKey>>> = {
      data: nextData,
      isLoading: state.isLoading,
      status: state.status,
      errors: state.errors,
    };

    target.update(
      targetKey,
      nextState as Partial<TTarget[TTargetKey]>,
    );
  });

  if (options.destroyRef) {
    options.destroyRef.onDestroy(cleanup);
  }

  return cleanup;
}
