import { InjectionToken } from '@angular/core';
import { BaseStore } from './base-store';
import { DynamicStore } from './dynamic-store';
import { resource } from './resource';
import type {
  StoreConfig,
  ResourceDef,
  InferEnum,
  InferData,
} from './types';

/**
 * Intermediate builder step after .resource('key') — awaits .as<T>().
 */
interface AsStep<TAccum extends StoreConfig, TKey extends string> {
  as<T>(): StoreBuilder<TAccum & Record<TKey, ResourceDef<T>>>;
}

/**
 * Fluent builder for creating stores.
 * Accumulates resource definitions then produces an InjectionToken on .build().
 */
interface StoreBuilder<TAccum extends StoreConfig> {
  resource<TKey extends string>(key: TKey): AsStep<TAccum, TKey>;
  build(): InjectionToken<BaseStore<InferEnum<TAccum>, InferData<TAccum>>>;
}

function createBuilder<TAccum extends StoreConfig>(
  accum: TAccum
): StoreBuilder<TAccum> {
  return {
    resource<TKey extends string>(key: TKey): AsStep<TAccum, TKey> {
      return {
        as<T>(): StoreBuilder<TAccum & Record<TKey, ResourceDef<T>>> {
          const nextAccum = {
            ...accum,
            [key]: resource<T>(),
          } as TAccum & Record<TKey, ResourceDef<T>>;
          return createBuilder(nextAccum);
        },
      };
    },
    build() {
      return new InjectionToken<
        BaseStore<InferEnum<TAccum>, InferData<TAccum>>
      >('FlurryxStore', {
        providedIn: 'root',
        factory: () => new DynamicStore(accum),
      });
    },
  };
}

/**
 * Fluent store builder entry point.
 *
 * @example
 * export const CustomersStore = Store
 *   .resource('customers').as<Customer[]>()
 *   .resource('customerDetails').as<Customer>()
 *   .build();
 */
export const Store = createBuilder({} as StoreConfig);
