import { finalize, Observable, take, tap } from "rxjs";
import { BaseStore } from "@flurryx/store";
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
  TEnum extends Record<string, string | number>,
  TData extends { [K in keyof TEnum]: ResourceState<unknown> }
>(
  store: BaseStore<TEnum, TData>,
  key: keyof TEnum,
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
