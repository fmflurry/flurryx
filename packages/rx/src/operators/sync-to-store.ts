import { finalize, Observable, take, tap } from "rxjs";
import type { BaseStore, IStore } from "@flurryx/store";
import type { ResourceState } from "@flurryx/core";
import {
  defaultErrorNormalizer,
  type ErrorNormalizer,
} from "../error/error-normalizer";

/**
 * Options for {@link syncToStore}.
 */
export interface SyncToStoreOptions {
  /**
   * Whether to complete the Observable after the first emission (applies `take(1)`).
   * @default true
   */
  completeOnFirstEmission?: boolean;
  /**
   * Callback invoked in `finalize()` after the Observable completes or errors.
   * Useful for side effects like clearing another slot or navigating.
   * @default undefined
   */
  callbackAfterComplete?: () => void;
  /**
   * Custom function to convert error objects into the normalized `ResourceErrors` shape.
   * @default defaultErrorNormalizer
   */
  errorNormalizer?: ErrorNormalizer;
}

interface SyncToStoreRuntimeStore {
  update(key: PropertyKey, newState: unknown): void;
}

export function syncToStore<
  TEnum extends Record<string, string | number>,
  TData extends { [K in keyof TEnum]: ResourceState<unknown> },
  K extends keyof TData
>(
  store: BaseStore<TEnum, TData>,
  key: K,
  options?: SyncToStoreOptions
): <R>(source: Observable<R>) => Observable<R>;

export function syncToStore<
  TData extends { [K in keyof TData]: ResourceState<unknown> },
  K extends keyof TData
>(
  store: IStore<TData>,
  key: K,
  options?: SyncToStoreOptions
): <R>(source: Observable<R>) => Observable<R>;

export function syncToStore(
  store: unknown,
  key: PropertyKey,
  options: SyncToStoreOptions = { completeOnFirstEmission: true }
) {
  const normalizeError = options.errorNormalizer ?? defaultErrorNormalizer;
  const syncStore = store as SyncToStoreRuntimeStore;

  return <R>(source: Observable<R>) => {
    let pipeline = source.pipe(
      tap({
        next: (data: R) => {
          syncStore.update(key, {
            data,
            isLoading: false,
            status: "Success",
            errors: undefined,
          });
        },
        error: (error: unknown) => {
          syncStore.update(key, {
            data: undefined,
            isLoading: false,
            status: "Error",
            errors: normalizeError(error),
          });
        },
      })
    );

    if (options.completeOnFirstEmission) {
      pipeline = pipeline.pipe(take(1));
    }

    if (options.callbackAfterComplete) {
      pipeline = pipeline.pipe(finalize(options.callbackAfterComplete));
    }

    return pipeline;
  };
}
