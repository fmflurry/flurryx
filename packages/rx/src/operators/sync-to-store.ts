import { finalize, Observable, take, tap } from "rxjs";
import type { IStore } from "@flurryx/store";
import type { ResourceState } from "@flurryx/core";
import {
  defaultErrorNormalizer,
  type ErrorNormalizer,
} from "../error/error-normalizer";

export interface SyncToStoreOptions {
  completeOnFirstEmission?: boolean;
  callbackAfterComplete?: () => void;
  errorNormalizer?: ErrorNormalizer;
}

export function syncToStore<
  TData extends Record<string, ResourceState<unknown>>,
  K extends keyof TData & string
>(
  store: IStore<TData>,
  key: K,
  options: SyncToStoreOptions = { completeOnFirstEmission: true }
) {
  const normalizeError = options.errorNormalizer ?? defaultErrorNormalizer;

  return <R>(source: Observable<R>) => {
    let pipeline = source.pipe(
      tap({
        next: (data: R) => {
          store.update(key, {
            data,
            isLoading: false,
            status: "Success",
            errors: undefined,
          } as Partial<TData[typeof key]>);
        },
        error: (error: unknown) => {
          store.update(key, {
            data: undefined,
            isLoading: false,
            status: "Error",
            errors: normalizeError(error),
          } as Partial<TData[typeof key]>);
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
