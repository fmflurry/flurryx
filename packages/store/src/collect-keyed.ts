import type {
  ResourceState,
  KeyedResourceKey,
  KeyedResourceData,
} from "@flurryx/core";
import { createKeyedResourceData } from "@flurryx/core";
import type { IStore, StoreDataShape, StoreKey } from "./types";

interface CacheInvalidationTarget<TData extends StoreDataShape<TData>> {
  invalidateCacheFor(key: StoreKey<TData>): void;
  invalidateCacheFor(key: StoreKey<TData>, resourceKey: KeyedResourceKey): void;
}

type KeyedResourceRecord<TEntity> = Partial<
  Record<KeyedResourceKey, ResourceState<TEntity>>
>;

function toKeyedResourceRecord<TEntity>(
  data: KeyedResourceData<KeyedResourceKey, TEntity>
): KeyedResourceRecord<TEntity> {
  return data as unknown as KeyedResourceRecord<TEntity>;
}

function hasAnyKeyLoading<TEntity>(data: KeyedResourceRecord<TEntity>): boolean {
  return Object.values(data).some((entry) => entry?.isLoading === true);
}

/**
 * Options for {@link collectKeyed}.
 *
 * @template TEntity - The entity type emitted by the source store.
 */
export interface CollectKeyedOptions<TEntity> {
  /**
   * Extracts the entity identifier from the source data.
   * Return `undefined` to skip accumulation for that emission.
   */
  extractId: (data: TEntity | undefined) => KeyedResourceKey | undefined;
  /**
   * Angular `DestroyRef` (or any object with an `onDestroy` method) for
   * automatic cleanup. When provided, collection stops when the ref is destroyed.
   */
  destroyRef?: { onDestroy: (fn: () => void) => void };
}

/**
 * Accumulates single-entity resource fetches into a keyed cache on a target store.
 *
 * On each source update:
 * - If status is 'Success' and extractId returns a valid key, merges the entity
 *   into the target's keyed resource data.
 * - If the source data is cleared and a previous entity existed, removes it from
 *   the target's keyed data.
 *
 * @param source - The store containing the single-entity resource
 * @param sourceKey - The key to watch on the source store
 * @param target - The store to accumulate entities into
 * @param targetKeyOrOptions - Either the target key name or options (defaults source key)
 * @param options - Collect options when a target key is provided
 * @returns Cleanup function to stop collecting
 */
export function collectKeyed<
  TSource extends StoreDataShape<TSource>,
  TTarget extends StoreDataShape<TTarget>,
  TEntity = unknown
>(
  source: IStore<TSource>,
  sourceKey: StoreKey<TSource>,
  target: IStore<TTarget>,
  targetKeyOrOptions?: StoreKey<TTarget> | CollectKeyedOptions<TEntity>,
  options?: CollectKeyedOptions<TEntity>
): () => void {
  const resolvedTargetKey = (
    typeof targetKeyOrOptions === "string" ? targetKeyOrOptions : sourceKey
  ) as StoreKey<TTarget>;

  const resolvedOptions = (
    typeof targetKeyOrOptions === "object" ? targetKeyOrOptions : options
  ) as CollectKeyedOptions<TEntity>;

  // Initialize target with empty keyed resource data
  target.update(resolvedTargetKey, {
    data: createKeyedResourceData(),
  } as Partial<TTarget[StoreKey<TTarget>]>);

  let previousId: KeyedResourceKey | undefined;

  const updateCleanup = source.onUpdate(sourceKey, (state) => {
    const resourceState = state as ResourceState<TEntity>;
    const currentId = resolvedOptions.extractId(resourceState.data);
    const currentTarget = target.get(resolvedTargetKey)();
    const currentKeyed = (currentTarget as ResourceState<unknown>).data as
      | KeyedResourceData<KeyedResourceKey, TEntity>
      | undefined;

    if (!currentKeyed) {
      return;
    }

    const keyedRecord = toKeyedResourceRecord(currentKeyed);

    if (resourceState.status === "Success" && currentId !== undefined) {
      const updatedKeyed: KeyedResourceRecord<TEntity> = {
        ...keyedRecord,
        [currentId]: {
          data: resourceState.data,
          isLoading: false,
          status: resourceState.status,
          errors: undefined,
        },
      };

      target.update(resolvedTargetKey, {
        data: updatedKeyed as unknown as KeyedResourceData<KeyedResourceKey, TEntity>,
        isLoading: hasAnyKeyLoading(updatedKeyed),
        status: "Success",
      } as Partial<TTarget[StoreKey<TTarget>]>);

      previousId = currentId;
    } else if (resourceState.status === "Error" && currentId !== undefined) {
      const updatedKeyed: KeyedResourceRecord<TEntity> = {
        ...keyedRecord,
        [currentId]: {
          ...keyedRecord[currentId],
          isLoading: false,
          status: resourceState.status,
          errors: resourceState.errors,
        },
      };

      target.update(resolvedTargetKey, {
        data: updatedKeyed as unknown as KeyedResourceData<KeyedResourceKey, TEntity>,
        isLoading: hasAnyKeyLoading(updatedKeyed),
      } as Partial<TTarget[StoreKey<TTarget>]>);

      previousId = currentId;
    } else if (resourceState.data === undefined && previousId !== undefined) {
      // Source cleared — remove previous entity from cache
      const updatedKeyed = { ...keyedRecord };
      delete updatedKeyed[previousId];

      target.update(resolvedTargetKey, {
        data: updatedKeyed as unknown as KeyedResourceData<KeyedResourceKey, TEntity>,
        isLoading: hasAnyKeyLoading(updatedKeyed),
      } as Partial<TTarget[StoreKey<TTarget>]>);

      previousId = undefined;
    } else if (resourceState.isLoading && currentId !== undefined) {
      const updatedKeyed: KeyedResourceRecord<TEntity> = {
        ...keyedRecord,
        [currentId]: {
          ...keyedRecord[currentId],
          data: resourceState.data,
          isLoading: true,
          status: undefined,
          errors: undefined,
        },
      };

      target.update(resolvedTargetKey, {
        data: updatedKeyed as unknown as KeyedResourceData<KeyedResourceKey, TEntity>,
        isLoading: true,
      } as Partial<TTarget[StoreKey<TTarget>]>);

      previousId = currentId;
    }
  });

  const invalidateCleanup = source.onCacheInvalidate(sourceKey, (event) => {
    const invalidationTarget = target as unknown as CacheInvalidationTarget<TTarget>;
    if (event.resourceKey === undefined) {
      invalidationTarget.invalidateCacheFor(resolvedTargetKey);
      return;
    }

    invalidationTarget.invalidateCacheFor(resolvedTargetKey, event.resourceKey);
  });

  const cleanup = () => {
    updateCleanup();
    invalidateCleanup();
  };

  if (resolvedOptions?.destroyRef) {
    resolvedOptions.destroyRef.onDestroy(cleanup);
  }

  return cleanup;
}
