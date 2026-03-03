import type {
  ResourceState,
  KeyedResourceKey,
  KeyedResourceData,
} from '@flurryx/core';
import { createKeyedResourceData, isAnyKeyLoading } from '@flurryx/core';
import type { IStore } from './types';

export interface CollectKeyedOptions<TEntity> {
  extractId: (data: TEntity | undefined) => KeyedResourceKey | undefined;
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
  TSource extends Record<string, ResourceState<unknown>>,
  TTarget extends Record<string, ResourceState<unknown>>,
  TEntity = unknown,
>(
  source: IStore<TSource>,
  sourceKey: keyof TSource & string,
  target: IStore<TTarget>,
  targetKeyOrOptions?: (keyof TTarget & string) | CollectKeyedOptions<TEntity>,
  options?: CollectKeyedOptions<TEntity>,
): () => void {
  const resolvedTargetKey = (
    typeof targetKeyOrOptions === 'string'
      ? targetKeyOrOptions
      : sourceKey
  ) as keyof TTarget & string;

  const resolvedOptions = (
    typeof targetKeyOrOptions === 'object' ? targetKeyOrOptions : options
  ) as CollectKeyedOptions<TEntity>;

  // Initialize target with empty keyed resource data
  target.update(resolvedTargetKey, {
    data: createKeyedResourceData(),
  } as Partial<TTarget[keyof TTarget & string]>);

  let previousId: KeyedResourceKey | undefined;

  const cleanup = source.onUpdate(sourceKey, (state) => {
    const resourceState = state as ResourceState<TEntity>;
    const currentId = resolvedOptions.extractId(resourceState.data);
    const currentTarget = target.get(resolvedTargetKey)();
    const currentKeyed = (currentTarget as ResourceState<unknown>).data as
      KeyedResourceData<KeyedResourceKey, TEntity> | undefined;

    if (!currentKeyed) {
      return;
    }

    if (resourceState.status === 'Success' && currentId !== undefined) {
      const newEntities = { ...currentKeyed.entities, [currentId]: resourceState.data };
      const newIsLoading = { ...currentKeyed.isLoading, [currentId]: false };
      const newStatus = { ...currentKeyed.status, [currentId]: resourceState.status };
      const newErrors = { ...currentKeyed.errors };
      delete newErrors[currentId];

      const updatedKeyed: KeyedResourceData<KeyedResourceKey, TEntity> = {
        entities: newEntities,
        isLoading: newIsLoading,
        status: newStatus,
        errors: newErrors,
      };

      target.update(resolvedTargetKey, {
        data: updatedKeyed,
        isLoading: isAnyKeyLoading(newIsLoading),
        status: 'Success',
      } as Partial<TTarget[keyof TTarget & string]>);

      previousId = currentId;
    } else if (resourceState.status === 'Error' && currentId !== undefined) {
      const newIsLoading = { ...currentKeyed.isLoading, [currentId]: false };
      const newStatus = { ...currentKeyed.status, [currentId]: resourceState.status };
      const newErrors = { ...currentKeyed.errors, [currentId]: resourceState.errors };

      const updatedKeyed: KeyedResourceData<KeyedResourceKey, TEntity> = {
        entities: { ...currentKeyed.entities },
        isLoading: newIsLoading,
        status: newStatus,
        errors: newErrors,
      };

      target.update(resolvedTargetKey, {
        data: updatedKeyed,
        isLoading: isAnyKeyLoading(newIsLoading),
      } as Partial<TTarget[keyof TTarget & string]>);

      previousId = currentId;
    } else if (resourceState.data === undefined && previousId !== undefined) {
      // Source cleared — remove previous entity from cache
      const { [previousId]: _removed, ...remainingEntities } = currentKeyed.entities;
      const { [previousId]: _removedLoading, ...remainingLoading } = currentKeyed.isLoading;
      const { [previousId]: _removedStatus, ...remainingStatus } = currentKeyed.status;
      const { [previousId]: _removedErrors, ...remainingErrors } = currentKeyed.errors;

      const updatedKeyed: KeyedResourceData<KeyedResourceKey, TEntity> = {
        entities: remainingEntities,
        isLoading: remainingLoading,
        status: remainingStatus,
        errors: remainingErrors,
      };

      target.update(resolvedTargetKey, {
        data: updatedKeyed,
        isLoading: isAnyKeyLoading(remainingLoading),
      } as Partial<TTarget[keyof TTarget & string]>);

      previousId = undefined;
    } else if (resourceState.isLoading && currentId !== undefined) {
      const newIsLoading = { ...currentKeyed.isLoading, [currentId]: true };

      const updatedKeyed: KeyedResourceData<KeyedResourceKey, TEntity> = {
        entities: { ...currentKeyed.entities },
        isLoading: newIsLoading,
        status: { ...currentKeyed.status },
        errors: { ...currentKeyed.errors },
      };

      target.update(resolvedTargetKey, {
        data: updatedKeyed,
        isLoading: true,
      } as Partial<TTarget[keyof TTarget & string]>);

      previousId = currentId;
    }
  });

  if (resolvedOptions?.destroyRef) {
    resolvedOptions.destroyRef.onDestroy(cleanup);
  }

  return cleanup;
}
