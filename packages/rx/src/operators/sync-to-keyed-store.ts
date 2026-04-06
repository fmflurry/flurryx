import { finalize, Observable, take, tap } from "rxjs";
import type { BaseStore, IStore } from "@flurryx/store";
import {
  createKeyedResourceData,
  isAnyKeyLoading,
  type KeyedResourceData,
  type KeyedResourceKey,
  type ResourceErrors,
  type ResourceState,
  type ResourceStatus,
} from "@flurryx/core";
import {
  defaultErrorNormalizer,
  type ErrorNormalizer,
} from "../error/error-normalizer";
import type { SyncToStoreOptions } from "./sync-to-store";

interface SyncToKeyedStoreRuntimeStore {
  get(key: PropertyKey): () => ResourceState<unknown>;
  update(key: PropertyKey, newState: unknown): void;
}

/**
 * Options for {@link syncToKeyedStore}.
 *
 * Extends {@link SyncToStoreOptions} with keyed-specific options.
 *
 * @template R - The raw response type from the Observable.
 * @template TValue - The entity type stored in the keyed slot.
 */
export interface SyncToKeyedStoreOptions<R, TValue> extends SyncToStoreOptions {
  /**
   * Transform the raw API response before writing it to the store.
   * Useful when the API envelope differs from the entity type.
   *
   * @default undefined (response is stored as-is)
   *
   * @example
   * ```ts
   * syncToKeyedStore(store, 'ITEMS', id, {
   *   mapResponse: (response) => response.data,
   * })
   * ```
   */
  mapResponse?: (response: R) => TValue;
  /**
   * Custom function to convert error objects into the normalized `ResourceErrors` shape.
   * @default defaultErrorNormalizer
   */
  errorNormalizer?: ErrorNormalizer;
}

function withoutKey<TKey extends KeyedResourceKey, TValue>(
  record: Partial<Record<TKey, TValue>>,
  key: TKey
): Partial<Record<TKey, TValue>> {
  const next: Partial<Record<TKey, TValue>> = {
    ...record,
  };
  delete next[key];
  return next;
}

/**
 * Syncs an Observable result into a keyed `ResourceState` slot on a Flurryx store.
 *
 * Each emission is written under `resourceKey` inside the slot's keyed data map.
 * On success, that key is marked as `"Success"` and no longer loading. On error,
 * the key is marked as `"Error"` and receives normalized errors.
 *
 * Use `mapResponse` when the Observable emits an API envelope and only part of it
 * should be stored as the keyed entity value.
 *
 * By default, the operator completes after the first emission by applying `take(1)`.
 *
 * @template TEnum - Enum-like store keys used by `BaseStore`.
 * @template TData - Store data shape.
 * @template TStoreKey - Store key whose value is a keyed `ResourceState`.
 * @template TKey - Entity key inside the keyed resource map.
 * @template TValue - Entity type stored in the keyed slot.
 * @template R - Raw Observable emission type.
 * @param store - The target Flurryx store instance.
 * @param storeKey - The keyed resource slot to update.
 * @param resourceKey - The entity identifier inside the keyed slot.
 * @param options - Optional response mapping, completion, finalization, and error normalization behavior.
 * @returns An RxJS operator function that syncs source emissions into the keyed store slot.
 *
 * @example
 * ```ts
 * this.api.getUser(id).pipe(
 *   syncToKeyedStore(this.store, "USERS", id)
 * )
 * ```
 */
export function syncToKeyedStore<
  TEnum extends Record<string, string | number>,
  TData extends { [K in keyof TEnum]: ResourceState<unknown> },
  TStoreKey extends keyof TData,
  TKey extends KeyedResourceKey,
  TValue,
  R = TValue
>(
  store: BaseStore<TEnum, TData>,
  storeKey: TStoreKey,
  resourceKey: TKey,
  options?: SyncToKeyedStoreOptions<R, TValue>
): (source: Observable<R>) => Observable<R>;

/**
 * Syncs an Observable result into a keyed `ResourceState` slot on a Flurryx store.
 *
 * Each emission is written under `resourceKey` inside the slot's keyed data map.
 * On success, that key is marked as `"Success"` and no longer loading. On error,
 * the key is marked as `"Error"` and receives normalized errors.
 *
 * Use `mapResponse` when the Observable emits an API envelope and only part of it
 * should be stored as the keyed entity value.
 *
 * By default, the operator completes after the first emission by applying `take(1)`.
 *
 * @template TData - Store data shape.
 * @template TStoreKey - Store key whose value is a keyed `ResourceState`.
 * @template TKey - Entity key inside the keyed resource map.
 * @template TValue - Entity type stored in the keyed slot.
 * @template R - Raw Observable emission type.
 * @param store - The target Flurryx store instance.
 * @param storeKey - The keyed resource slot to update.
 * @param resourceKey - The entity identifier inside the keyed slot.
 * @param options - Optional response mapping, completion, finalization, and error normalization behavior.
 * @returns An RxJS operator function that syncs source emissions into the keyed store slot.
 */
export function syncToKeyedStore<
  TData extends { [K in keyof TData]: ResourceState<unknown> },
  TStoreKey extends keyof TData,
  TKey extends KeyedResourceKey,
  TValue,
  R = TValue
>(
  store: IStore<TData>,
  storeKey: TStoreKey,
  resourceKey: TKey,
  options?: SyncToKeyedStoreOptions<R, TValue>
): (source: Observable<R>) => Observable<R>;

export function syncToKeyedStore(
  store: unknown,
  storeKey: PropertyKey,
  resourceKey: KeyedResourceKey,
  options: SyncToKeyedStoreOptions<unknown, unknown> = {
    completeOnFirstEmission: true,
  }
) {
  const { completeOnFirstEmission, callbackAfterComplete, mapResponse } =
    options;
  const normalizeError = options.errorNormalizer ?? defaultErrorNormalizer;
  const syncStore = store as SyncToKeyedStoreRuntimeStore;

  return (source: Observable<unknown>) => {
    let pipeline = source.pipe(
      tap({
        next: (response: unknown) => {
          const value = mapResponse ? mapResponse(response) : response;

          const storeSignal = syncStore.get(storeKey);
          const state = storeSignal();
          const data =
            (state.data as
              | KeyedResourceData<KeyedResourceKey, unknown>
              | undefined) ??
            createKeyedResourceData<KeyedResourceKey, unknown>();

          const nextIsLoading = {
            ...data.isLoading,
            [resourceKey]: false,
          } as Partial<Record<KeyedResourceKey, boolean>>;

          const nextStatus: Partial<Record<KeyedResourceKey, ResourceStatus>> =
            {
              ...data.status,
              [resourceKey]: "Success" as ResourceStatus,
            };

          const nextData: KeyedResourceData<KeyedResourceKey, unknown> = {
            ...data,
            entities: {
              ...data.entities,
              [resourceKey]: value,
            } as Partial<Record<KeyedResourceKey, unknown>>,
            isLoading: nextIsLoading,
            status: nextStatus,
            errors: withoutKey(data.errors, resourceKey),
          };

          syncStore.update(storeKey, {
            data: nextData,
            isLoading: isAnyKeyLoading(nextIsLoading),
            status: undefined,
            errors: undefined,
          });
        },
        error: (error: unknown) => {
          const storeSignal = syncStore.get(storeKey);
          const state = storeSignal();
          const data =
            (state.data as
              | KeyedResourceData<KeyedResourceKey, unknown>
              | undefined) ??
            createKeyedResourceData<KeyedResourceKey, unknown>();

          const nextIsLoading = {
            ...data.isLoading,
            [resourceKey]: false,
          } as Partial<Record<KeyedResourceKey, boolean>>;

          const nextStatus: Partial<Record<KeyedResourceKey, ResourceStatus>> =
            {
              ...data.status,
              [resourceKey]: "Error" as ResourceStatus,
            };

          const nextErrors: Partial<Record<KeyedResourceKey, ResourceErrors>> =
            {
              ...data.errors,
              [resourceKey]: normalizeError(error),
            };

          const nextData: KeyedResourceData<KeyedResourceKey, unknown> = {
            ...data,
            isLoading: nextIsLoading,
            status: nextStatus,
            errors: nextErrors,
          };

          syncStore.update(storeKey, {
            data: nextData,
            isLoading: isAnyKeyLoading(nextIsLoading),
            status: undefined,
            errors: undefined,
          });
        },
      })
    );

    if (completeOnFirstEmission) {
      pipeline = pipeline.pipe(take(1));
    }

    if (callbackAfterComplete) {
      pipeline = pipeline.pipe(finalize(callbackAfterComplete));
    }

    return pipeline;
  };
}
