import type { ResourceState } from "@flurryx/core";
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

/**
 * Single acknowledged point in store history.
 *
 * Entry `0` is always the initial snapshot captured when the history driver is
 * created, so its `id`, `message`, and `acknowledgedAt` are `null`.
 */
export interface StoreHistoryEntry<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> {
  /** Stable message id used by `replay(...)`; `null` for the initial snapshot entry. */
  readonly id: number | null;
  /** Snapshot position used by `travelTo(index)`, `undo()`, and `redo()`. */
  readonly index: number;
  /** Acknowledged message that produced this snapshot; `null` for the initial entry. */
  readonly message: StoreMessage<TData, TKey> | null;
  /** Full store snapshot captured immediately after the message was acknowledged. */
  readonly snapshot: StoreSnapshot<TData, TKey>;
  /** Acknowledgement timestamp for the message; `null` for the initial snapshot entry. */
  readonly acknowledgedAt: number | null;
}

export type StoreMessageStatus = "pending" | "acknowledged" | "dead-letter";

/**
 * Persisted broker message record stored in the active message channel.
 *
 * Message ids are allocated when the message is first published and remain stable
 * across acknowledgement, replay, and dead-letter transitions.
 */
export interface StoreMessageRecord<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> {
  /** Stable message id used by `replay(...)` and dead-letter recovery APIs. */
  readonly id: number;
  /** Published store message payload. */
  readonly message: StoreMessage<TData, TKey>;
  /** Latest delivery status stored by the broker channel. */
  readonly status: StoreMessageStatus;
  /** Number of delivery attempts made for this message. */
  readonly attempts: number;
  /** Timestamp when the message was first published to the channel. */
  readonly createdAt: number;
  /** Timestamp of the most recent delivery attempt. */
  readonly lastAttemptedAt: number | null;
  /** Timestamp of the most recent successful acknowledgement, if any. */
  readonly acknowledgedAt: number | null;
  /** Last recorded delivery error, or `null` when the latest attempt succeeded. */
  readonly error: string | null;
}

/** Minimal string-based storage adapter used by storage-backed message channels. */
export interface StoreMessageChannelStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Pluggable persistence channel used by the broker to store published messages.
 *
 * The default channel is in-memory, but storage-backed or custom providers can be
 * supplied to keep messages available across refreshes or offline sessions.
 */
export interface StoreMessageChannel<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> {
  /** Stores a newly published message and allocates its stable message id. */
  publish(message: StoreMessage<TData, TKey>): StoreMessageRecord<TData, TKey>;
  /** Reads a single persisted message record by id. */
  getMessage(id: number): StoreMessageRecord<TData, TKey> | undefined;
  /** Reads every persisted message record from the channel. */
  getMessages(): readonly StoreMessageRecord<TData, TKey>[];
  /** Persists a new state for an existing message record. */
  saveMessage(entry: StoreMessageRecord<TData, TKey>): void;
}

/** Optional store configuration used to override the default in-memory message channel. */
export interface StoreMessageChannelOptions<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> {
  readonly channel?: StoreMessageChannel<TData, TKey>;
}

export interface CompositeStoreMessageChannelOptions<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> {
  readonly channels: readonly StoreMessageChannel<TData, TKey>[];
}

export interface StorageStoreMessageChannelOptions<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> {
  readonly storage: StoreMessageChannelStorage;
  readonly storageKey: string;
  readonly serialize?: (
    state: PersistedStoreMessageChannelState<TData, TKey>
  ) => string;
  readonly deserialize?: (
    value: string
  ) => PersistedStoreMessageChannelState<TData, TKey>;
}

export interface BrowserStorageStoreMessageChannelOptions<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> extends Omit<StorageStoreMessageChannelOptions<TData, TKey>, "storage"> {
  readonly storage?: StoreMessageChannelStorage;
}

/**
 * Failed message tracked by the internal broker when the store consumer does not
 * acknowledge a published message.
 */
export interface StoreDeadLetterEntry<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> {
  /** Stable dead-letter id used by `replayDeadLetter(id)`. */
  readonly id: number;
  /** Original message that failed acknowledgement. */
  readonly message: StoreMessage<TData, TKey>;
  /** Number of failed acknowledgement attempts for this dead letter. */
  readonly attempts: number;
  /** Last acknowledgement error captured for this dead letter. */
  readonly error: string;
  /** Timestamp of the most recent failure. */
  readonly failedAt: number;
}

/**
 * Public history and recovery API exposed on every store instance.
 *
 * `travelTo(...)` navigates snapshots by history index, while `replay(...)`
 * re-executes previously published channel messages by their stable message ids.
 */
export interface StoreHistory<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> {
  /**
   * Re-executes one previously published message by id.
   *
   * The message does not need to have been acknowledged before. Replay resolves it
   * from the configured message channel, sends it back through the broker/consumer
   * flow, and may create a fresh acknowledged history entry if the replay succeeds.
   *
   * @throws {Error} When the id does not point to a persisted channel message.
   * @returns Number of successfully acknowledged replayed messages.
   */
  replay(id: number): number;

  /**
   * Re-executes multiple previously published messages in the provided order.
   *
   * Every id must resolve to a persisted channel message. Replay stops with an error
   * if any supplied id is invalid.
   *
   * @throws {Error} When any id does not point to a persisted channel message.
   * @returns Number of successfully acknowledged replayed messages.
   */
  replay(ids: readonly number[]): number;

  /**
   * Restores the store to the snapshot recorded at a specific history index.
   *
   * This is snapshot navigation only. It does not publish or acknowledge any
   * message and does not create a new history entry.
   *
   * @throws {Error} When the index is outside the recorded history range.
   */
  travelTo(index: number): void;

  /**
   * Moves to the previous recorded snapshot.
   *
   * Equivalent to `travelTo(getCurrentIndex() - 1)` when possible.
   *
   * @returns `true` when the pointer moved, otherwise `false` at the initial snapshot.
   */
  undo(): boolean;

  /**
   * Moves to the next recorded snapshot when history exists ahead of the current pointer.
   *
   * Equivalent to `travelTo(getCurrentIndex() + 1)` when possible.
   *
   * @returns `true` when the pointer moved, otherwise `false` at the latest snapshot.
   */
  redo(): boolean;

  /** Returns a defensive copy of every recorded history entry, including the initial snapshot entry. */
  getHistory(): readonly StoreHistoryEntry<TData, TKey>[];

  /**
   * Returns the history entries that affected a specific store key.
   *
   * The initial snapshot entry is always included as the first item. Messages such
   * as `clearAll` that affect every key are included in every filtered view.
   */
  getHistory<K extends TKey>(key: K): readonly StoreHistoryEntry<TData, K>[];

  /** Returns a defensive copy of the current dead-letter collection. */
  getDeadLetters(): readonly StoreDeadLetterEntry<TData, TKey>[];

  /** Returns every message currently stored in the configured channel. */
  getMessages(): readonly StoreMessageRecord<TData, TKey>[];

  /** Returns channel messages that affected a specific store key. */
  getMessages<K extends TKey>(key: K): readonly StoreMessageRecord<TData, K>[];

  /**
   * Republishes a single dead-letter message by dead-letter id.
   *
   * On success the dead letter is removed and a new acknowledged history entry is recorded.
   *
   * @returns `true` when the dead letter was acknowledged on replay, otherwise `false`.
   */
  replayDeadLetter(id: number): boolean;

  /**
   * Attempts to republish every current dead letter once.
   *
   * Successfully acknowledged dead letters are removed. Failures remain in the
   * dead-letter collection with incremented attempt counts.
   *
   * @returns Number of dead letters successfully acknowledged during the replay attempt.
   */
  replayDeadLetters(): number;

  /** Returns the currently restored history index used by snapshot navigation. */
  getCurrentIndex(): number;
}

export interface StoreHistoryDriver<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> extends StoreHistory<TData, TKey> {
  publish(message: StoreMessage<TData, TKey>): boolean;
}

interface CreateStoreHistoryConfig<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> {
  readonly captureSnapshot: () => StoreSnapshot<TData, TKey>;
  readonly applySnapshot: (snapshot: StoreSnapshot<TData, TKey>) => void;
  readonly applyMessage: (message: StoreMessage<TData, TKey>) => boolean;
  readonly channel?: StoreMessageChannel<TData, TKey>;
}

interface PersistedStoreMessageChannelState<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> {
  readonly nextId: number;
  readonly messages: readonly StoreMessageRecord<TData, TKey>[];
}

type SerializedStoreMessageChannelValue =
  | null
  | boolean
  | number
  | string
  | {
      readonly __flurryxType: "undefined";
    }
  | {
      readonly __flurryxType: "date";
      readonly value: string;
    }
  | {
      readonly __flurryxType: "array";
      readonly values: readonly SerializedStoreMessageChannelValue[];
    }
  | {
      readonly __flurryxType: "set";
      readonly values: readonly SerializedStoreMessageChannelValue[];
    }
  | {
      readonly __flurryxType: "map";
      readonly entries: readonly [
        SerializedStoreMessageChannelValue,
        SerializedStoreMessageChannelValue,
      ][];
    }
  | {
      readonly __flurryxType: "object";
      readonly entries: readonly [string, SerializedStoreMessageChannelValue][];
    };

const INVALID_HISTORY_INDEX_ERROR = "History index is out of range";
const INVALID_HISTORY_MESSAGE_ID_ERROR = "History message id is out of range";
const MESSAGE_NOT_ACKNOWLEDGED_ERROR = "Message was not acknowledged";

export function cloneValue<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    const existingClone = cloneReference(value, new WeakMap<object, unknown>());
    return existingClone as T;
  }

  return value;
}

function cloneReference<T extends object>(
  value: T,
  seen: WeakMap<object, unknown>
): T {
  const seenClone = seen.get(value);
  if (seenClone) {
    return seenClone as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (value instanceof Map) {
    const clonedMap = new Map<unknown, unknown>();
    seen.set(value, clonedMap);
    value.forEach((entryValue, key) => {
      clonedMap.set(cloneValueWithSeen(key, seen), cloneValueWithSeen(entryValue, seen));
    });
    return clonedMap as T;
  }

  if (value instanceof Set) {
    const clonedSet = new Set<unknown>();
    seen.set(value, clonedSet);
    value.forEach((entryValue) => {
      clonedSet.add(cloneValueWithSeen(entryValue, seen));
    });
    return clonedSet as T;
  }

  if (Array.isArray(value)) {
    const clonedArray: unknown[] = [];
    seen.set(value, clonedArray);
    value.forEach((item, index) => {
      clonedArray[index] = cloneValueWithSeen(item, seen);
    });

    return clonedArray as T;
  }

  const clonedObject = Object.create(
    Object.getPrototypeOf(value)
  ) as Record<PropertyKey, unknown>;
  seen.set(value, clonedObject);

  Reflect.ownKeys(value).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) {
      return;
    }

    if ("value" in descriptor) {
      descriptor.value = cloneValueWithSeen(descriptor.value, seen);
    }

    Object.defineProperty(clonedObject, key, descriptor);
  });

  return clonedObject as T;
}

function cloneValueWithSeen<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (value !== null && typeof value === "object") {
    return cloneReference(value, seen);
  }

  return value;
}

function serializeStoreMessageChannelValue(
  value: unknown
): SerializedStoreMessageChannelValue {
  if (value === undefined) {
    return { __flurryxType: "undefined" };
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return {
      __flurryxType: "date",
      value: value.toISOString(),
    };
  }

  if (value instanceof Map) {
    return {
      __flurryxType: "map",
      entries: Array.from(value.entries(), ([key, entryValue]) => [
        serializeStoreMessageChannelValue(key),
        serializeStoreMessageChannelValue(entryValue),
      ]),
    };
  }

  if (value instanceof Set) {
    return {
      __flurryxType: "set",
      values: Array.from(value.values(), (entryValue) =>
        serializeStoreMessageChannelValue(entryValue)
      ),
    };
  }

  if (Array.isArray(value)) {
    return {
      __flurryxType: "array",
      values: value.map((entryValue) =>
        serializeStoreMessageChannelValue(entryValue)
      ),
    };
  }

  if (typeof value === "object") {
    return {
      __flurryxType: "object",
      entries: Object.entries(value as Record<string, unknown>).map(
        ([key, entryValue]) => [
          key,
          serializeStoreMessageChannelValue(entryValue),
        ]
      ),
    };
  }

  throw new Error("Store message channel cannot serialize this value");
}

function deserializeStoreMessageChannelValue(
  value: SerializedStoreMessageChannelValue
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  switch (value.__flurryxType) {
    case "undefined":
      return undefined;
    case "date":
      return new Date(value.value);
    case "array":
      return value.values.map((entryValue) =>
        deserializeStoreMessageChannelValue(entryValue)
      );
    case "set":
      return new Set(
        value.values.map((entryValue) =>
          deserializeStoreMessageChannelValue(entryValue)
        )
      );
    case "map":
      return new Map(
        value.entries.map(([key, entryValue]) => [
          deserializeStoreMessageChannelValue(key),
          deserializeStoreMessageChannelValue(entryValue),
        ])
      );
    case "object": {
      const result: Record<string, unknown> = {};
      value.entries.forEach(([key, entryValue]) => {
        result[key] = deserializeStoreMessageChannelValue(entryValue);
      });
      return result;
    }
  }
}

function defaultSerializeStoreMessageChannelState<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData>
>(state: PersistedStoreMessageChannelState<TData, TKey>): string {
  return JSON.stringify(
    serializeStoreMessageChannelValue(state)
  );
}

function defaultDeserializeStoreMessageChannelState<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData>
>(value: string): PersistedStoreMessageChannelState<TData, TKey> {
  return deserializeStoreMessageChannelValue(
    JSON.parse(value) as SerializedStoreMessageChannelValue
  ) as PersistedStoreMessageChannelState<TData, TKey>;
}

function normalizeStoreMessageChannelState<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData>
>(
  state: PersistedStoreMessageChannelState<TData, TKey>
): PersistedStoreMessageChannelState<TData, TKey> {
  const maxId = state.messages.reduce(
    (currentMax, entry) => Math.max(currentMax, entry.id),
    0
  );

  return {
    nextId: Math.max(state.nextId, maxId + 1),
    messages: state.messages.map((entry) => cloneValue(entry)),
  };
}

function createInitialStoreMessageRecord<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData>
>(
  id: number,
  message: StoreMessage<TData, TKey>
): StoreMessageRecord<TData, TKey> {
  return {
    id,
    message: cloneValue(message),
    status: "pending",
    attempts: 0,
    createdAt: Date.now(),
    lastAttemptedAt: null,
    acknowledgedAt: null,
    error: null,
  };
}

function resolveGlobalStorage(
  name: "localStorage" | "sessionStorage"
): StoreMessageChannelStorage {
  const storage = globalThis[name];
  if (!storage) {
    throw new Error(`${name} is not available in this environment`);
  }

  return storage as StoreMessageChannelStorage;
}

export function createInMemoryStoreMessageChannel<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
>(): StoreMessageChannel<TData, TKey> {
  const messages: StoreMessageRecord<TData, TKey>[] = [];
  let nextId = 1;

  return {
    publish(message) {
      const record = createInitialStoreMessageRecord(nextId++, message);
      messages.push(record);
      return cloneValue(record);
    },
    getMessage(id) {
      const record = messages.find((entry) => entry.id === id);
      return record ? cloneValue(record) : undefined;
    },
    getMessages() {
      return messages.map((entry) => cloneValue(entry));
    },
    saveMessage(entry) {
      const record = cloneValue(entry);
      const existingIndex = messages.findIndex(
        (candidate) => candidate.id === record.id
      );

      if (existingIndex === -1) {
        messages.push(record);
      } else {
        messages[existingIndex] = record;
      }

      nextId = Math.max(nextId, record.id + 1);
    },
  };
}

export function createStorageStoreMessageChannel<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
>(
  options: StorageStoreMessageChannelOptions<TData, TKey>
): StoreMessageChannel<TData, TKey> {
  const serialize =
    options.serialize ?? defaultSerializeStoreMessageChannelState<TData, TKey>;
  const deserialize =
    options.deserialize ??
    defaultDeserializeStoreMessageChannelState<TData, TKey>;

  function readState(): PersistedStoreMessageChannelState<TData, TKey> {
    const rawState = options.storage.getItem(options.storageKey);
    if (rawState === null) {
      return {
        nextId: 1,
        messages: [],
      };
    }

    return normalizeStoreMessageChannelState(deserialize(rawState));
  }

  function writeState(
    state: PersistedStoreMessageChannelState<TData, TKey>
  ): void {
    options.storage.setItem(
      options.storageKey,
      serialize(normalizeStoreMessageChannelState(state))
    );
  }

  return {
    publish(message) {
      const state = readState();
      const record = createInitialStoreMessageRecord(state.nextId, message);

      writeState({
        nextId: state.nextId + 1,
        messages: [...state.messages, record],
      });

      return cloneValue(record);
    },
    getMessage(id) {
      const record = readState().messages.find((entry) => entry.id === id);
      return record ? cloneValue(record) : undefined;
    },
    getMessages() {
      return readState().messages.map((entry) => cloneValue(entry));
    },
    saveMessage(entry) {
      const state = readState();
      const record = cloneValue(entry);
      const existingIndex = state.messages.findIndex(
        (candidate) => candidate.id === record.id
      );

      if (existingIndex === -1) {
        writeState({
          nextId: Math.max(state.nextId, record.id + 1),
          messages: [...state.messages, record],
        });
        return;
      }

      const nextMessages = [...state.messages];
      nextMessages[existingIndex] = record;

      writeState({
        nextId: Math.max(state.nextId, record.id + 1),
        messages: nextMessages,
      });
    },
  };
}

export function createLocalStorageStoreMessageChannel<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
>(
  options: BrowserStorageStoreMessageChannelOptions<TData, TKey>
): StoreMessageChannel<TData, TKey> {
  return createStorageStoreMessageChannel({
    ...options,
    storage: options.storage ?? resolveGlobalStorage("localStorage"),
  });
}

export function createSessionStorageStoreMessageChannel<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
>(
  options: BrowserStorageStoreMessageChannelOptions<TData, TKey>
): StoreMessageChannel<TData, TKey> {
  return createStorageStoreMessageChannel({
    ...options,
    storage: options.storage ?? resolveGlobalStorage("sessionStorage"),
  });
}

export function createCompositeStoreMessageChannel<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
>(
  options: CompositeStoreMessageChannelOptions<TData, TKey>
): StoreMessageChannel<TData, TKey> {
  if (options.channels.length === 0) {
    throw new Error("Composite store message channel requires at least one channel");
  }

  const primaryChannel = options.channels[0]!;
  const replicaChannels = options.channels.slice(1);

  return {
    publish(message) {
      const record = primaryChannel.publish(message);
      replicaChannels.forEach((channel) => {
        channel.saveMessage(record);
      });
      return cloneValue(record);
    },
    getMessage(id) {
      const record = primaryChannel.getMessage(id);
      return record ? cloneValue(record) : undefined;
    },
    getMessages() {
      return primaryChannel.getMessages().map((record) => cloneValue(record));
    },
    saveMessage(entry) {
      primaryChannel.saveMessage(entry);
      replicaChannels.forEach((channel) => {
        channel.saveMessage(entry);
      });
    },
  };
}

function messageAffectsKey<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData>,
  K extends TKey,
>(message: StoreMessage<TData, TKey>, key: K): message is StoreMessage<TData, K> {
  if (message.type === "clearAll") {
    return true;
  }

  return "key" in message && message.key === key;
}

function toDeadLetterEntry<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData>
>(
  record: StoreMessageRecord<TData, TKey>
): StoreDeadLetterEntry<TData, TKey> {
  return {
    id: record.id,
    message: cloneValue(record.message),
    attempts: record.attempts,
    error: record.error ?? MESSAGE_NOT_ACKNOWLEDGED_ERROR,
    failedAt: record.lastAttemptedAt ?? record.createdAt,
  };
}

export function createSnapshotRestorePatch<TState extends ResourceState<unknown>>(
  currentState: TState,
  snapshotState: TState
): Partial<TState> {
  const patch: Record<PropertyKey, unknown> = {};
  const keys = new Set([
    ...Reflect.ownKeys(currentState),
    ...Reflect.ownKeys(snapshotState),
  ]);

  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(snapshotState, key)) {
      patch[key] = cloneValue(
        (snapshotState as Record<PropertyKey, unknown>)[key]
      );
      return;
    }

    patch[key] = undefined;
  });

  return patch as Partial<TState>;
}

export function createStoreHistory<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
>(config: CreateStoreHistoryConfig<TData, TKey>): StoreHistoryDriver<TData, TKey> {
  const messageChannel =
    config.channel ?? createInMemoryStoreMessageChannel<TData, TKey>();
  const history: StoreHistoryEntry<TData, TKey>[] = [
    {
      id: null,
      index: 0,
      message: null,
      snapshot: config.captureSnapshot(),
      acknowledgedAt: null,
    },
  ];
  let currentIndex = 0;

  function recordSnapshot(record: StoreMessageRecord<TData, TKey>): void {
    const nextIndex = history.length;
    history.push({
      id: record.id,
      index: nextIndex,
      message: cloneValue(record.message),
      snapshot: config.captureSnapshot(),
      acknowledgedAt: record.acknowledgedAt,
    });
    currentIndex = nextIndex;
  }

  function truncateFutureHistory(): void {
    if (currentIndex === history.length - 1) {
      return;
    }

    history.splice(currentIndex + 1);
  }

  function ensureIndexInRange(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= history.length) {
      throw new Error(INVALID_HISTORY_INDEX_ERROR);
    }
  }

  function travelTo(index: number): void {
    ensureIndexInRange(index);
    config.applySnapshot(history[index]!.snapshot);
    currentIndex = index;
  }

  function undo(): boolean {
    if (currentIndex === 0) {
      return false;
    }

    travelTo(currentIndex - 1);
    return true;
  }

  function redo(): boolean {
    if (currentIndex >= history.length - 1) {
      return false;
    }

    travelTo(currentIndex + 1);
    return true;
  }

  function getErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return MESSAGE_NOT_ACKNOWLEDGED_ERROR;
  }

  function persistMessageAttempt(
    record: StoreMessageRecord<TData, TKey>,
    status: StoreMessageStatus,
    error: string | null,
    attemptedAt: number
  ): StoreMessageRecord<TData, TKey> {
    const nextRecord: StoreMessageRecord<TData, TKey> = {
      ...record,
      message: cloneValue(record.message),
      status,
      attempts: record.attempts + 1,
      lastAttemptedAt: attemptedAt,
      acknowledgedAt: status === "acknowledged" ? attemptedAt : record.acknowledgedAt,
      error,
    };

    messageChannel.saveMessage(nextRecord);
    return nextRecord;
  }

  function consumeRecord(
    record: StoreMessageRecord<TData, TKey>,
    options?: {
      readonly recordHistory?: boolean;
    }
  ): boolean {
    const clonedMessage = cloneValue(record.message);
    const attemptedAt = Date.now();

    try {
      const acknowledged = config.applyMessage(clonedMessage);
      if (!acknowledged) {
        throw new Error(MESSAGE_NOT_ACKNOWLEDGED_ERROR);
      }

      const acknowledgedRecord = persistMessageAttempt(
        {
          ...record,
          message: clonedMessage,
        },
        "acknowledged",
        null,
        attemptedAt
      );

      if (options?.recordHistory !== false) {
        truncateFutureHistory();
        recordSnapshot(acknowledgedRecord);
      }

      return true;
    } catch (error) {
      persistMessageAttempt(
        {
          ...record,
          message: clonedMessage,
        },
        "dead-letter",
        getErrorMessage(error),
        attemptedAt
      );
      return false;
    }
  }

  function resolveReplayRecords(
    ids: readonly number[]
  ): StoreMessageRecord<TData, TKey>[] {
    return ids.map((id) => {
      if (!Number.isInteger(id) || id < 1) {
        throw new Error(INVALID_HISTORY_MESSAGE_ID_ERROR);
      }

      const record = messageChannel.getMessage(id);
      if (!record) {
        throw new Error(INVALID_HISTORY_MESSAGE_ID_ERROR);
      }

      return cloneValue(record);
    });
  }

  function replayByIds(input: number | readonly number[]): number {
    const ids = Array.isArray(input) ? input : [input];
    const records = resolveReplayRecords(ids);
    let acknowledgedCount = 0;

    records.forEach((record) => {
      if (consumeRecord(record)) {
        acknowledgedCount += 1;
      }
    });

    return acknowledgedCount;
  }

  function replayDeadLetter(id: number): boolean {
    const record = messageChannel.getMessage(id);
    if (!record || record.status !== "dead-letter") {
      return false;
    }

    return consumeRecord(record);
  }

  function replayDeadLetters(): number {
    const ids = messageChannel
      .getMessages()
      .filter((record) => record.status === "dead-letter")
      .map((record) => record.id);
    let acknowledgedCount = 0;

    ids.forEach((id) => {
      if (replayDeadLetter(id)) {
        acknowledgedCount += 1;
      }
    });

    return acknowledgedCount;
  }

  return {
    publish(message) {
      const record = messageChannel.publish(message);
      return consumeRecord(record);
    },
    replay(input: number | readonly number[]) {
      return replayByIds(input);
    },
    travelTo,
    undo,
    redo,
    getHistory<K extends TKey>(key?: K) {
      if (key === undefined) {
        return history.map((entry) => cloneValue(entry));
      }

      return history
        .filter((entry) => {
          if (entry.message === null) {
            return true;
          }

          return messageAffectsKey(entry.message, key);
        })
        .map((entry) => cloneValue(entry) as StoreHistoryEntry<TData, K>);
    },
    getMessages<K extends TKey>(key?: K) {
      const records = messageChannel.getMessages();
      if (key === undefined) {
        return records.map((record) => cloneValue(record));
      }

      return records
        .filter((record) => messageAffectsKey(record.message, key))
        .map((record) => cloneValue(record) as StoreMessageRecord<TData, K>);
    },
    getDeadLetters() {
      return messageChannel
        .getMessages()
        .filter((record) => record.status === "dead-letter")
        .map((record) => toDeadLetterEntry(record));
    },
    replayDeadLetter,
    replayDeadLetters,
    getCurrentIndex() {
      return currentIndex;
    },
  };
}
