import type {
  KeyedResourceEntryKey,
  KeyedResourceEntryValue,
  KeyedStoreKey,
  StoreDataShape,
  StoreKey,
} from "./types";

/** Message produced by `store.update(key, partial)` — merges partial state into a slot. */
export type UpdateStoreMessage<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> = {
  readonly [K in TKey]: {
    readonly type: "update";
    readonly key: K;
    readonly state: Partial<TData[K]>;
  };
}[TKey];

/** Message produced by `store.clear(key)` — resets a single slot to its initial state. */
export type ClearStoreMessage<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> = {
  readonly [K in TKey]: {
    readonly type: "clear";
    readonly key: K;
  };
}[TKey];

/** Message produced by `store.clearAll()` — resets every slot in the store. */
export interface ClearAllStoreMessage<TData extends StoreDataShape<TData>> {
  readonly type: "clearAll";
}

/** Message produced by `store.startLoading(key)` — sets `isLoading: true` and clears `status`/`errors`. */
export type StartLoadingStoreMessage<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> = {
  readonly [K in TKey]: {
    readonly type: "startLoading";
    readonly key: K;
  };
}[TKey];

/** Message produced by `store.stopLoading(key)` — sets `isLoading: false`. */
export type StopLoadingStoreMessage<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> = {
  readonly [K in TKey]: {
    readonly type: "stopLoading";
    readonly key: K;
  };
}[TKey];

/** Message produced by `store.updateKeyedOne(key, resourceKey, entity)` — merges a single entity into a keyed slot. */
export type UpdateKeyedOneStoreMessage<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> = {
  readonly [K in KeyedStoreKey<TData, TKey>]: {
    readonly type: "updateKeyedOne";
    readonly key: K;
    readonly resourceKey: KeyedResourceEntryKey<TData, K>;
    readonly entity: KeyedResourceEntryValue<TData, K>;
  };
}[KeyedStoreKey<TData, TKey>];

/** Message produced by `store.clearKeyedOne(key, resourceKey)` — removes a single entity from a keyed slot. */
export type ClearKeyedOneStoreMessage<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> = {
  readonly [K in KeyedStoreKey<TData, TKey>]: {
    readonly type: "clearKeyedOne";
    readonly key: K;
    readonly resourceKey: KeyedResourceEntryKey<TData, K>;
  };
}[KeyedStoreKey<TData, TKey>];

/** Message produced by `store.startKeyedLoading(key, resourceKey)` — marks a single entity as loading. */
export type StartKeyedLoadingStoreMessage<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> = {
  readonly [K in KeyedStoreKey<TData, TKey>]: {
    readonly type: "startKeyedLoading";
    readonly key: K;
    readonly resourceKey: KeyedResourceEntryKey<TData, K>;
  };
}[KeyedStoreKey<TData, TKey>];

/** Discriminated union of all typed store messages published to the broker channel. */
export type StoreMessage<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> =
  | UpdateStoreMessage<TData, TKey>
  | ClearStoreMessage<TData, TKey>
  | ClearAllStoreMessage<TData>
  | StartLoadingStoreMessage<TData, TKey>
  | StopLoadingStoreMessage<TData, TKey>
  | UpdateKeyedOneStoreMessage<TData, TKey>
  | ClearKeyedOneStoreMessage<TData, TKey>
  | StartKeyedLoadingStoreMessage<TData, TKey>;

/** Full store state captured at a point in time, keyed by slot name. Used by history and time travel. */
export type StoreSnapshot<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> = Partial<{
  readonly [K in TKey]: TData[K];
}>;

/** Delivery status of a broker message: `"pending"` → `"acknowledged"` or `"dead-letter"`. */
export type StoreMessageStatus = "pending" | "acknowledged" | "dead-letter";

/** Error message thrown when `restoreStoreAt()` receives an index outside the recorded history range. */
export const INVALID_HISTORY_INDEX_ERROR = "History index is out of range";
/** Error message thrown when `replay()` receives an id that does not match a persisted channel message. */
export const INVALID_HISTORY_MESSAGE_ID_ERROR =
  "History message id is out of range";
/** Error message recorded in dead-letter entries when the store consumer does not acknowledge a message. */
export const MESSAGE_NOT_ACKNOWLEDGED_ERROR = "Message was not acknowledged";
/** Error message thrown when `restoreResource()` receives a key that is not a valid store key. */
export const INVALID_STORE_KEY_ERROR = "Invalid store key";
