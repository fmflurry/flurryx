import type { Signal } from "@angular/core";
import type { ResourceState, KeyedResourceKey } from "@flurryx/core";

/**
 * Constraint type ensuring every key in a store data map holds a {@link ResourceState}.
 */
export type StoreDataShape<TData> = {
  [K in keyof TData]: ResourceState<unknown>;
};

/**
 * Extracts the string-typed keys from a store data map.
 */
export type StoreKey<TData> = keyof TData & string;

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
export type ConfigToData<TConfig extends object> = {
  [K in keyof TConfig & string]: ResourceState<TConfig[K]>;
};

/**
 * Shared store interface implemented by both BaseStore and LazyStore.
 *
 * All store instances expose these methods regardless of how they were created
 * (interface-based, fluent, or enum-constrained builder).
 */
export interface IStore<TData extends StoreDataShape<TData>> {
  /** Returns a read-only `Signal` for the given slot. */
  get<K extends StoreKey<TData>>(key: K): Signal<TData[K]>;
  /** Merges a partial state into the given slot (immutable spread). */
  update<K extends StoreKey<TData>>(key: K, newState: Partial<TData[K]>): void;
  /** Resets a slot to its initial idle state (`{ data: undefined, isLoading: false, … }`). */
  clear<K extends StoreKey<TData>>(key: K): void;
  /** Resets every slot in this store. */
  clearAll(): void;
  /** Marks a slot as loading: sets `isLoading: true` and clears `status`/`errors`. */
  startLoading<K extends StoreKey<TData>>(key: K): void;
  /** Marks a slot as no longer loading: sets `isLoading: false`. */
  stopLoading<K extends StoreKey<TData>>(key: K): void;
  /** Merges a single entity into a keyed slot and sets its status to `'Success'`. */
  updateKeyedOne<K extends StoreKey<TData>>(
    key: K,
    resourceKey: KeyedResourceKey,
    entity: unknown
  ): void;
  /** Removes a single entity (and its loading/status/errors) from a keyed slot. */
  clearKeyedOne<K extends StoreKey<TData>>(
    key: K,
    resourceKey: KeyedResourceKey
  ): void;
  /** Marks a single entity within a keyed slot as loading. */
  startKeyedLoading<K extends StoreKey<TData>>(
    key: K,
    resourceKey: KeyedResourceKey
  ): void;
  /**
   * Registers a callback invoked whenever the given slot is updated.
   * @returns A cleanup function that removes the listener.
   */
  onUpdate<K extends StoreKey<TData>>(
    key: K,
    callback: (state: TData[K], previousState: TData[K]) => void
  ): () => void;
}
