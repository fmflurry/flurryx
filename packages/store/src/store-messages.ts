import type {
  KeyedResourceEntryKey,
  KeyedResourceEntryValue,
  KeyedStoreKey,
  StoreDataShape,
  StoreKey,
} from "./types";

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

export type ClearStoreMessage<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> = {
  readonly [K in TKey]: {
    readonly type: "clear";
    readonly key: K;
  };
}[TKey];

export interface ClearAllStoreMessage<TData extends StoreDataShape<TData>> {
  readonly type: "clearAll";
}

export type StartLoadingStoreMessage<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> = {
  readonly [K in TKey]: {
    readonly type: "startLoading";
    readonly key: K;
  };
}[TKey];

export type StopLoadingStoreMessage<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> = {
  readonly [K in TKey]: {
    readonly type: "stopLoading";
    readonly key: K;
  };
}[TKey];

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

export type StoreSnapshot<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> = Partial<{
  readonly [K in TKey]: TData[K];
}>;

export type StoreMessageStatus = "pending" | "acknowledged" | "dead-letter";

export const INVALID_HISTORY_INDEX_ERROR = "History index is out of range";
export const INVALID_HISTORY_MESSAGE_ID_ERROR =
  "History message id is out of range";
export const MESSAGE_NOT_ACKNOWLEDGED_ERROR = "Message was not acknowledged";
