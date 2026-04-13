import type { StoreDataShape, StoreKey } from "./types";
import type { StoreMessage, StoreMessageStatus } from "./store-messages";
import type { StoreDeadLetterMeta } from "./store-dead-letter";
import { cloneValue } from "./store-clone";

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
  /** Optional dead-letter metadata attached by the publisher. */
  readonly deadLetter: StoreDeadLetterMeta | null;
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

/** Options for {@link createCompositeStoreMessageChannel}. The first channel is the primary (reads + id allocation); replicas receive all writes. */
export interface CompositeStoreMessageChannelOptions<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> {
  readonly channels: readonly StoreMessageChannel<TData, TKey>[];
}

/** Options for {@link createStorageStoreMessageChannel}. Provide a custom storage adapter, key, and optional serialize/deserialize hooks. */
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

/** Options for {@link createLocalStorageStoreMessageChannel} and {@link createSessionStorageStoreMessageChannel}. Storage defaults to the browser global. */
export interface BrowserStorageStoreMessageChannelOptions<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
> extends Omit<StorageStoreMessageChannelOptions<TData, TKey>, "storage"> {
  readonly storage?: StoreMessageChannelStorage;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

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
        SerializedStoreMessageChannelValue
      ][];
    }
  | {
      readonly __flurryxType: "object";
      readonly entries: readonly [string, SerializedStoreMessageChannelValue][];
    };

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

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
  return JSON.stringify(serializeStoreMessageChannelValue(state));
}

function defaultDeserializeStoreMessageChannelState<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData>
>(value: string): PersistedStoreMessageChannelState<TData, TKey> {
  return deserializeStoreMessageChannelValue(
    JSON.parse(value) as SerializedStoreMessageChannelValue
  ) as PersistedStoreMessageChannelState<TData, TKey>;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

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

export function createInitialStoreMessageRecord<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData>
>(
  id: number,
  message: StoreMessage<TData, TKey>,
  clock: () => number = Date.now
): StoreMessageRecord<TData, TKey> {
  return {
    id,
    message: cloneValue(message),
    status: "pending",
    attempts: 0,
    createdAt: clock(),
    lastAttemptedAt: null,
    acknowledgedAt: null,
    error: null,
    deadLetter: null,
  };
}

function isQuotaExceededError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.code === 22 ||
      error.code === 1014 ||
      error.name === "QuotaExceededError" ||
      error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
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

// ---------------------------------------------------------------------------
// Channel factories
// ---------------------------------------------------------------------------

/**
 * Creates an in-memory message channel. Messages are stored in a JavaScript array
 * and lost on page refresh. This is the default channel when no `channel` option is provided.
 */
export function createInMemoryStoreMessageChannel<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
>(): StoreMessageChannel<TData, TKey> {
  let messages: StoreMessageRecord<TData, TKey>[] = [];
  let nextId = 1;

  return {
    publish(message) {
      const record = createInitialStoreMessageRecord(nextId++, message);
      messages = [...messages, record];
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
        messages = [...messages, record];
      } else {
        messages = messages.map((c, i) => (i === existingIndex ? record : c));
      }

      nextId = Math.max(nextId, record.id + 1);
    },
  };
}

/**
 * Creates a message channel backed by a custom storage adapter.
 * Messages are serialized and persisted via the provided `storage` object.
 * When the storage quota is exceeded, the oldest messages are evicted automatically.
 *
 * @param options - Storage adapter, key, and optional serialize/deserialize hooks.
 */
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
      return { nextId: 1, messages: [] };
    }
    try {
      return normalizeStoreMessageChannelState(deserialize(rawState));
    } catch {
      return { nextId: 1, messages: [] };
    }
  }

  function writeState(
    state: PersistedStoreMessageChannelState<TData, TKey>
  ): void {
    const normalized = normalizeStoreMessageChannelState(state);
    try {
      options.storage.setItem(options.storageKey, serialize(normalized));
    } catch (error: unknown) {
      if (!isQuotaExceededError(error) || normalized.messages.length === 0) {
        throw error;
      }
      // Evict oldest messages one at a time until the write succeeds
      let remaining = [...normalized.messages];
      while (remaining.length > 0) {
        remaining = remaining.slice(1);
        try {
          options.storage.setItem(
            options.storageKey,
            serialize({ nextId: normalized.nextId, messages: remaining })
          );
          return;
        } catch (retryError: unknown) {
          if (!isQuotaExceededError(retryError)) {
            throw retryError;
          }
        }
      }
      // All messages evicted — write empty state
      options.storage.setItem(
        options.storageKey,
        serialize({ nextId: normalized.nextId, messages: [] })
      );
    }
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

      const nextMessages = state.messages.map((c, i) =>
        i === existingIndex ? record : c
      );

      writeState({
        nextId: Math.max(state.nextId, record.id + 1),
        messages: nextMessages,
      });
    },
  };
}

/**
 * Creates a message channel backed by `localStorage`.
 * Messages survive page refreshes and browser restarts (same-origin only).
 *
 * @param options - Storage key and optional serialize/deserialize hooks.
 */
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

/**
 * Creates a message channel backed by `sessionStorage`.
 * Messages survive page refreshes but are lost when the browser tab closes.
 *
 * @param options - Storage key and optional serialize/deserialize hooks.
 */
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

/**
 * Creates a composite message channel that fans out writes to multiple channels.
 * The first channel is the primary (handles reads and id allocation); all channels receive writes.
 *
 * @param options - Array of channels. Must contain at least one.
 */
export function createCompositeStoreMessageChannel<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
>(
  options: CompositeStoreMessageChannelOptions<TData, TKey>
): StoreMessageChannel<TData, TKey> {
  if (options.channels.length === 0) {
    throw new Error(
      "createCompositeStoreMessageChannel: 'channels' option must contain at least one channel"
    );
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
