import type { WritableSignal } from "@angular/core";
import type { ResourceState, KeyedResourceKey } from "@flurryx/core";

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

/**
 * Maps a plain config interface to ResourceState-wrapped data.
 * e.g. { SESSIONS: ChatSession[] } -> { SESSIONS: ResourceState<ChatSession[]> }
 */
export type ConfigToData<TConfig extends Record<string, unknown>> = {
  [K in keyof TConfig & string]: ResourceState<TConfig[K]>;
};

/**
 * Shared store interface implemented by both BaseStore and LazyStore.
 */
export interface IStore<TData extends Record<string, ResourceState<unknown>>> {
  get<K extends keyof TData & string>(key: K): WritableSignal<TData[K]>;
  update<K extends keyof TData & string>(
    key: K,
    newState: Partial<TData[K]>
  ): void;
  clear<K extends keyof TData & string>(key: K): void;
  clearAll(): void;
  startLoading<K extends keyof TData & string>(key: K): void;
  stopLoading<K extends keyof TData & string>(key: K): void;
  updateKeyedOne<K extends keyof TData & string>(
    key: K,
    resourceKey: KeyedResourceKey,
    entity: unknown
  ): void;
  clearKeyedOne<K extends keyof TData & string>(
    key: K,
    resourceKey: KeyedResourceKey
  ): void;
  startKeyedLoading<K extends keyof TData & string>(
    key: K,
    resourceKey: KeyedResourceKey
  ): void;
  onUpdate<K extends keyof TData & string>(
    key: K,
    callback: (state: TData[K], previousState: TData[K]) => void
  ): () => void;
}
