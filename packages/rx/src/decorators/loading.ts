import type { StoreEnum, KeyedResourceKey } from "@flurryx/core";

type StoreWithLoading<TKey extends StoreEnum> = {
  startLoading: (key: TKey) => void;
};

/**
 * Method decorator that calls `store.startLoading(key)` before the original method executes.
 *
 * **Keyed detection**: If the first method argument is a `string | number` and the store
 * has a `startKeyedLoading` method, it calls that instead for per-key loading state.
 *
 * Typically composed with `@SkipIfCached` (which should be the outermost decorator):
 * ```ts
 * @SkipIfCached('LIST', (i) => i.store)  // outermost — can short-circuit
 * @Loading('LIST', (i) => i.store)        // sets loading before method body
 * loadProducts() { ... }
 * ```
 *
 * @param storeKey - The store slot to mark as loading.
 * @param storeGetter - Function to retrieve the store from the decorated class instance.
 */
export function Loading<TKey extends StoreEnum>(
  storeKey: TKey,
  storeGetter: (instance: {
    store: StoreWithLoading<TKey>;
  }) => StoreWithLoading<TKey>
): MethodDecorator;
/** @inheritDoc */
export function Loading<TTarget, TKey extends StoreEnum>(
  storeKey: TKey,
  storeGetter: (instance: TTarget) => StoreWithLoading<TKey>
): MethodDecorator;
export function Loading<TTarget, TKey extends StoreEnum>(
  storeKey: TKey,
  storeGetter: (instance: TTarget) => StoreWithLoading<TKey>
) {
  return function (
    _target: unknown,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value as (
      this: unknown,
      ...args: unknown[]
    ) => unknown;

    descriptor.value = function (this: TTarget, ...args: unknown[]) {
      const store = storeGetter(this);

      const resourceKey = args[0];
      const canKey =
        typeof resourceKey === "string" || typeof resourceKey === "number";
      const hasKeyed =
        typeof store === "object" &&
        store !== null &&
        "startKeyedLoading" in store &&
        typeof (store as { startKeyedLoading?: unknown }).startKeyedLoading ===
          "function";

      if (canKey && hasKeyed) {
        (
          store as unknown as {
            startKeyedLoading: (
              key: TKey,
              resourceKey: KeyedResourceKey
            ) => void;
          }
        ).startKeyedLoading(storeKey, resourceKey as KeyedResourceKey);
      } else {
        store?.startLoading(storeKey);
      }
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
