import type { Signal } from "@angular/core";
import type {
  ResourceState,
  KeyedResourceData,
  KeyedResourceKey,
} from "@flurryx/core";
import type { StoreHistory } from "./store-replay";
import type { StoreMessageChannelOptions } from "./store-channels";

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

/** Extracts the value stored inside a store slot's `ResourceState<T>`. */
export type StoreResourceValue<
  TData extends StoreDataShape<TData>,
  K extends StoreKey<TData>
> = TData[K] extends ResourceState<infer TValue> ? TValue : never;

/** Narrows store keys whose `data` payload is a keyed resource map. */
export type KeyedStoreKey<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> = {
  [K in TKey]: StoreResourceValue<TData, K> extends KeyedResourceData<
    infer _TResourceKey,
    infer _TValue
  >
    ? K
    : never;
}[TKey];

/** Extracts the resource key type for a keyed store slot. */
export type KeyedResourceEntryKey<
  TData extends StoreDataShape<TData>,
  K extends KeyedStoreKey<TData>
> = StoreResourceValue<TData, K> extends KeyedResourceData<
  infer TResourceKey,
  unknown
>
  ? TResourceKey
  : never;

/** Extracts the entity value type for a keyed store slot. */
export type KeyedResourceEntryValue<
  TData extends StoreDataShape<TData>,
  K extends KeyedStoreKey<TData>
> = StoreResourceValue<TData, K> extends KeyedResourceData<
  KeyedResourceKey,
  infer TValue
>
  ? TValue
  : never;

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
 * Optional runtime configuration for a store instance.
 *
 * The default channel is in-memory. Supply `channel` to persist broker messages
 * elsewhere, such as local storage, session storage, a composite channel, or a
 * custom provider.
 */
export interface StoreOptions<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> extends StoreMessageChannelOptions<TData, TKey> {}

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
  /**
   * Re-executes previously published channel message id(s).
   *
   * Unlike `travelTo(...)`, replay goes back through the broker/consumer path,
   * so it can mutate the store again, truncate future history after time
   * travel, and record new acknowledged history entries.
   */
  replay: StoreHistory<TData>["replay"];
  /**
   * Restores the store to a previously recorded history index.
   *
   * This navigates snapshots only and does not re-run any message.
   */
  travelTo: StoreHistory<TData>["travelTo"];
  /** Moves one step backward in the recorded snapshot history when possible. */
  undo: StoreHistory<TData>["undo"];
  /** Moves one step forward in the recorded snapshot history when possible. */
  redo: StoreHistory<TData>["redo"];
  /**
   * Returns a defensive copy of the recorded history.
   *
   * The first entry is always the initial snapshot captured when the store was created.
   */
  getHistory: StoreHistory<TData>["getHistory"];
  /**
   * Returns persisted broker message records from the configured channel.
   *
   * Use `getMessages(key)` to inspect only the messages that affected one store key.
   */
  getMessages: StoreHistory<TData>["getMessages"];
  /**
   * Returns messages that failed broker acknowledgement.
   *
   * These entries can be inspected for diagnostics and retried later.
   */
  getDeadLetters: StoreHistory<TData>["getDeadLetters"];
  /** Replays a single dead-letter message by dead-letter id. */
  replayDeadLetter: StoreHistory<TData>["replayDeadLetter"];
  /** Attempts to replay all current dead-letter messages once. */
  replayDeadLetters: StoreHistory<TData>["replayDeadLetters"];
  /** Returns the currently restored snapshot index used by `travelTo`, `undo`, and `redo`. */
  getCurrentIndex: StoreHistory<TData>["getCurrentIndex"];
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
