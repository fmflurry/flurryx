import type { StoreEnum, KeyedResourceKey } from '@flurryx/core';

type StoreWithLoading<TKey extends StoreEnum> = {
  startLoading: (key: TKey) => void;
};

export function Loading<TKey extends StoreEnum>(
  storeKey: TKey,
  storeGetter: (instance: {
    store: StoreWithLoading<TKey>;
  }) => StoreWithLoading<TKey>
): MethodDecorator;
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
        typeof resourceKey === 'string' || typeof resourceKey === 'number';
      const hasKeyed =
        typeof store === 'object' &&
        store !== null &&
        'startKeyedLoading' in store &&
        typeof (store as { startKeyedLoading?: unknown }).startKeyedLoading ===
          'function';

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
