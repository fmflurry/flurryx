import { finalize, Observable, take, tap } from "rxjs";
import type { IStore } from "@flurryx/store";
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

export interface SyncToKeyedStoreOptions<R, TValue> extends SyncToStoreOptions {
  mapResponse?: (response: R) => TValue;
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

export function syncToKeyedStore<
  TData extends Record<string, ResourceState<unknown>>,
  TStoreKey extends keyof TData & string,
  TKey extends KeyedResourceKey,
  TValue,
  R = TValue
>(
  store: IStore<TData>,
  storeKey: TStoreKey,
  resourceKey: TKey,
  options: SyncToKeyedStoreOptions<R, TValue> = {
    completeOnFirstEmission: true,
  }
) {
  const { completeOnFirstEmission, callbackAfterComplete, mapResponse } =
    options;
  const normalizeError = options.errorNormalizer ?? defaultErrorNormalizer;

  return (source: Observable<R>) => {
    let pipeline = source.pipe(
      tap({
        next: (response: R) => {
          const value = mapResponse
            ? mapResponse(response)
            : (response as unknown as TValue);

          const storeSignal = store.get(storeKey);
          const state = storeSignal();
          const data =
            (state.data as KeyedResourceData<TKey, TValue> | undefined) ??
            createKeyedResourceData<TKey, TValue>();

          const nextIsLoading = {
            ...data.isLoading,
            [resourceKey]: false,
          } as Partial<Record<TKey, boolean>>;

          const nextStatus: Partial<Record<TKey, ResourceStatus>> = {
            ...data.status,
            [resourceKey]: "Success",
          };

          const nextData: KeyedResourceData<TKey, TValue> = {
            ...data,
            entities: {
              ...data.entities,
              [resourceKey]: value,
            } as Partial<Record<TKey, TValue>>,
            isLoading: nextIsLoading,
            status: nextStatus,
            errors: withoutKey(data.errors, resourceKey),
          };

          store.update(storeKey, {
            data: nextData,
            isLoading: isAnyKeyLoading(nextIsLoading),
            status: undefined,
            errors: undefined,
          } as Partial<TData[typeof storeKey]>);
        },
        error: (error: unknown) => {
          const storeSignal = store.get(storeKey);
          const state = storeSignal();
          const data =
            (state.data as KeyedResourceData<TKey, TValue> | undefined) ??
            createKeyedResourceData<TKey, TValue>();

          const nextIsLoading = {
            ...data.isLoading,
            [resourceKey]: false,
          } as Partial<Record<TKey, boolean>>;

          const nextStatus: Partial<Record<TKey, ResourceStatus>> = {
            ...data.status,
            [resourceKey]: "Error",
          };

          const nextErrors: Partial<Record<TKey, ResourceErrors>> = {
            ...data.errors,
            [resourceKey]: normalizeError(error),
          };

          const nextData: KeyedResourceData<TKey, TValue> = {
            ...data,
            isLoading: nextIsLoading,
            status: nextStatus,
            errors: nextErrors,
          };

          store.update(storeKey, {
            data: nextData,
            isLoading: isAnyKeyLoading(nextIsLoading),
            status: undefined,
            errors: undefined,
          } as Partial<TData[typeof storeKey]>);
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
