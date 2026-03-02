import type { ResourceState } from '@flurryx/core';

/**
 * Phantom-typed marker for a store resource slot.
 * Carries type information at compile time with zero runtime cost.
 */
export interface ResourceDef<T> {
  readonly __phantom: T;
}

/**
 * Configuration object for createStore().
 * Keys become store keys, values are ResourceDef<T> markers.
 */
export type StoreConfig = Record<string, ResourceDef<unknown>>;

/**
 * Infers an identity enum type from a StoreConfig.
 * e.g. { customers: resource<Customer[]>() } -> { customers: 'customers' }
 */
export type InferEnum<TConfig extends StoreConfig> = {
  readonly [K in keyof TConfig & string]: K;
};

/**
 * Infers the data map from a StoreConfig.
 * e.g. { customers: resource<Customer[]>() } -> { customers: ResourceState<Customer[]> }
 */
export type InferData<TConfig extends StoreConfig> = {
  [K in keyof TConfig & string]: ResourceState<
    TConfig[K] extends ResourceDef<infer T> ? T : never
  >;
};
