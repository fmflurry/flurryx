import { signal, computed, type Signal } from "@angular/core";
import type { StoreDataShape, StoreKey } from "./types";
import type {
  StoreMessage,
  StoreSnapshot,
  StoreMessageStatus,
} from "./store-messages";
import type { StoreDeadLetterCommand, StoreDeadLetterMeta } from "./store-dead-letter";
import {
  INVALID_HISTORY_INDEX_ERROR,
  INVALID_HISTORY_MESSAGE_ID_ERROR,
  INVALID_STORE_KEY_ERROR,
  MESSAGE_NOT_ACKNOWLEDGED_ERROR,
} from "./store-messages";
import { cloneValue } from "./store-clone";
import { createDefaultState } from "./store-message-consumer";
import {
  createInMemoryStoreMessageChannel,
  type StoreMessageChannel,
  type StoreMessageRecord,
} from "./store-channels";

// ---------------------------------------------------------------------------
// Re-exports — keep existing consumers working
// ---------------------------------------------------------------------------

export { cloneValue, createSnapshotRestorePatch } from "./store-clone";
export type {
  StoreMessage,
  StoreSnapshot,
  StoreMessageStatus,
  UpdateStoreMessage,
  ClearStoreMessage,
  ClearAllStoreMessage,
  StartLoadingStoreMessage,
  StopLoadingStoreMessage,
  UpdateKeyedOneStoreMessage,
  ClearKeyedOneStoreMessage,
  StartKeyedLoadingStoreMessage,
} from "./store-messages";
export {
  INVALID_HISTORY_INDEX_ERROR,
  INVALID_HISTORY_MESSAGE_ID_ERROR,
  INVALID_STORE_KEY_ERROR,
  MESSAGE_NOT_ACKNOWLEDGED_ERROR,
} from "./store-messages";
export {
  createInMemoryStoreMessageChannel,
  createStorageStoreMessageChannel,
  createLocalStorageStoreMessageChannel,
  createSessionStorageStoreMessageChannel,
  createCompositeStoreMessageChannel,
} from "./store-channels";
export type {
  StoreMessageChannel,
  StoreMessageChannelStorage,
  StoreMessageChannelOptions,
  CompositeStoreMessageChannelOptions,
  StorageStoreMessageChannelOptions,
  BrowserStorageStoreMessageChannelOptions,
  StoreMessageRecord,
} from "./store-channels";

// ---------------------------------------------------------------------------
// History types
// ---------------------------------------------------------------------------

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
  /** Snapshot position used by `restoreStoreAt(index)`, `undo()`, and `redo()`. */
  readonly index: number;
  /** Acknowledged message that produced this snapshot; `null` for the initial entry. */
  readonly message: StoreMessage<TData, TKey> | null;
  /** Full store snapshot captured immediately after the message was acknowledged. */
  readonly snapshot: StoreSnapshot<TData, TKey>;
  /** Acknowledgement timestamp for the message; `null` for the initial snapshot entry. */
  readonly acknowledgedAt: number | null;
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
  /** HTTP status captured with the dead letter when available. */
  readonly httpStatus: number | null;
  /** HTTP message captured with the dead letter when available. */
  readonly httpMessage: string | null;
  /** Replayable command metadata captured with the dead letter when available. */
  readonly command: StoreDeadLetterCommand | null;
  /** Timestamp of the most recent failure. */
  readonly failedAt: number;
}

export interface DeadLetterCommandResolverResult {
  readonly resolved: boolean;
  readonly clear: boolean;
}

/**
 * Public history and recovery API exposed on every store instance.
 *
 * `restoreStoreAt(...)` navigates snapshots by history index, while `replay(...)`
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
  restoreStoreAt(index: number): void;

  /**
   * Restores a single store key to its state at a specific history index.
   *
   * Unlike `restoreStoreAt(index)` which restores the full snapshot, this method
   * only restores the specified key while leaving other keys unaffected.
   * This is snapshot navigation only. It does not publish or acknowledge any
   * message and does not create a new history entry.
   *
   * @param key - The store key to restore.
   * @param index - Optional history index. Defaults to the current index.
   * @throws {Error} When the key is not a valid store key.
   * @throws {Error} When the index is outside the recorded history range.
   */
  restoreResource<K extends TKey>(key: K, index?: number): void;

  /**
   * Moves to the previous recorded snapshot.
   *
   * Equivalent to `restoreStoreAt(getCurrentIndex() - 1)` when possible.
   *
   * @returns `true` when the pointer moved, otherwise `false` at the initial snapshot.
   */
  undo(): boolean;

  /**
   * Moves to the next recorded snapshot when history exists ahead of the current pointer.
   *
   * Equivalent to `restoreStoreAt(getCurrentIndex() + 1)` when possible.
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

  /** Resolves one dead-letter entry by rerunning its originating command. */
  replayDeadLetterCommand(
    id: number,
    resolver: (
      entry: Readonly<StoreDeadLetterEntry<TData, TKey>>
    ) => Promise<DeadLetterCommandResolverResult>
  ): Promise<boolean>;

  /** Returns the currently restored history index used by snapshot navigation. */
  getCurrentIndex(): number;

  /** Reactive signal containing the full history entries. */
  readonly historySignal: Signal<readonly StoreHistoryEntry<TData, TKey>[]>;
  /** Reactive signal containing all channel message records. */
  readonly messagesSignal: Signal<readonly StoreMessageRecord<TData, TKey>[]>;
  /** Reactive signal containing the current history index. */
  readonly currentIndexSignal: Signal<number>;
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
  readonly applyKeyUpdate: <K extends TKey>(key: K, snapshotState: TData[K]) => void;
  readonly getAllKeys: () => Iterable<TKey>;
  readonly applyMessage: (message: StoreMessage<TData, TKey>) => boolean;
  readonly channel?: StoreMessageChannel<TData, TKey>;
  readonly clock?: () => number;
}

interface StableReadonlyCollectionAppendInput<TItem> {
  readonly items: readonly TItem[];
  readonly item: TItem;
}

interface StableReadonlyCollectionUpsertInput<
  TItem extends {
    readonly id: number;
  }
> {
  readonly items: readonly TItem[];
  readonly item: TItem;
}

interface StableReadonlyCollectionSyncInput<
  TSource,
  TItem extends {
    readonly id: number;
  }
> {
  readonly items: readonly TItem[];
  readonly sourceItems: readonly TSource[];
  readonly getSourceId: (item: TSource) => number;
  readonly createItem: (item: TSource) => TItem;
  readonly areEquivalent: (sourceItem: TSource, cachedItem: TItem) => boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function messageAffectsKey<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData>,
  K extends TKey
>(
  message: StoreMessage<TData, TKey>,
  key: K
): message is StoreMessage<TData, K> {
  if (message.type === "clearAll") {
    return true;
  }

  return "key" in message && message.key === key;
}

function toDeadLetterEntry<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData>
>(record: StoreMessageRecord<TData, TKey>): StoreDeadLetterEntry<TData, TKey> {
  const deadLetter = record.deadLetter;
  return {
    id: record.id,
    message: cloneValue(record.message),
    attempts: record.attempts,
    error:
      deadLetter?.error ?? record.error ?? MESSAGE_NOT_ACKNOWLEDGED_ERROR,
    httpStatus: deadLetter?.httpStatus ?? null,
    httpMessage: deadLetter?.httpMessage ?? null,
    command: deadLetter?.command ?? null,
    failedAt: record.lastAttemptedAt ?? record.createdAt,
  };
}

function getMessageDeadLetterMeta<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData>
>(message: StoreMessage<TData, TKey>): StoreDeadLetterMeta | null {
  if (message.type !== "update" || message.deadLetter === undefined) {
    return null;
  }

  return cloneValue(message.deadLetter);
}

function hasDeadLetterRecord<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData>
>(record: StoreMessageRecord<TData, TKey>): boolean {
  return record.status === "dead-letter" || record.deadLetter !== null;
}

function areValuesEquivalent(
  left: unknown,
  right: unknown,
  seen: WeakMap<object, WeakSet<object>> = new WeakMap<object, WeakSet<object>>()
): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (typeof left !== typeof right || left === null || right === null) {
    return false;
  }

  if (typeof left !== "object" || typeof right !== "object") {
    return false;
  }

  let seenRights = seen.get(left);
  if (seenRights?.has(right)) {
    return true;
  }

  if (!seenRights) {
    seenRights = new WeakSet<object>();
    seen.set(left, seenRights);
  }
  seenRights.add(right);

  if (left instanceof Date || right instanceof Date) {
    return (
      left instanceof Date &&
      right instanceof Date &&
      left.getTime() === right.getTime()
    );
  }

  if (left instanceof Map || right instanceof Map) {
    if (!(left instanceof Map) || !(right instanceof Map)) {
      return false;
    }

    const leftEntries = Array.from(left.entries());
    const rightEntries = Array.from(right.entries());
    if (leftEntries.length !== rightEntries.length) {
      return false;
    }

    return leftEntries.every(([leftKey, leftValue], index) => {
      const rightEntry = rightEntries[index];
      if (!rightEntry) {
        return false;
      }

      return (
        areValuesEquivalent(leftKey, rightEntry[0], seen) &&
        areValuesEquivalent(leftValue, rightEntry[1], seen)
      );
    });
  }

  if (left instanceof Set || right instanceof Set) {
    if (!(left instanceof Set) || !(right instanceof Set)) {
      return false;
    }

    const leftValues = Array.from(left.values());
    const rightValues = Array.from(right.values());
    if (leftValues.length !== rightValues.length) {
      return false;
    }

    return leftValues.every((leftValue, index) =>
      areValuesEquivalent(leftValue, rightValues[index], seen)
    );
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }

    if (left.length !== right.length) {
      return false;
    }

    return left.every((leftValue, index) =>
      areValuesEquivalent(leftValue, right[index], seen)
    );
  }

  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) {
    return false;
  }

  const leftRecord = left as Record<PropertyKey, unknown>;
  const rightRecord = right as Record<PropertyKey, unknown>;
  const leftKeys = Reflect.ownKeys(leftRecord);
  const rightKeys = Reflect.ownKeys(rightRecord);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => {
    if (!Object.prototype.hasOwnProperty.call(rightRecord, key)) {
      return false;
    }

    return areValuesEquivalent(leftRecord[key], rightRecord[key], seen);
  });
}

function areStoreMessageRecordsEquivalent<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData>
>(
  sourceRecord: StoreMessageRecord<TData, TKey>,
  cachedRecord: StoreMessageRecord<TData, TKey>
): boolean {
  return (
    sourceRecord.id === cachedRecord.id &&
    sourceRecord.status === cachedRecord.status &&
    sourceRecord.attempts === cachedRecord.attempts &&
    sourceRecord.createdAt === cachedRecord.createdAt &&
    sourceRecord.lastAttemptedAt === cachedRecord.lastAttemptedAt &&
    sourceRecord.acknowledgedAt === cachedRecord.acknowledgedAt &&
    sourceRecord.error === cachedRecord.error &&
    areValuesEquivalent(sourceRecord.deadLetter, cachedRecord.deadLetter) &&
    areValuesEquivalent(sourceRecord.message, cachedRecord.message)
  );
}

function createStableReadonlyCollection<TItem>(
  items: readonly TItem[]
): readonly TItem[] {
  return Object.freeze([...items]);
}

function appendStableReadonlyCollectionItem<TItem>(
  input: StableReadonlyCollectionAppendInput<TItem>
): readonly TItem[] {
  return createStableReadonlyCollection([...input.items, input.item]);
}

function upsertStableReadonlyCollectionItem<
  TItem extends {
    readonly id: number;
  }
>(input: StableReadonlyCollectionUpsertInput<TItem>): readonly TItem[] {
  const existingIndex = input.items.findIndex(
    (candidate) => candidate.id === input.item.id
  );

  if (existingIndex === -1) {
    return appendStableReadonlyCollectionItem(input);
  }

  if (Object.is(input.items[existingIndex], input.item)) {
    return input.items;
  }

  const nextItems = [...input.items];
  nextItems[existingIndex] = input.item;
  return createStableReadonlyCollection(nextItems);
}

function syncStableReadonlyCollectionById<
  TSource,
  TItem extends {
    readonly id: number;
  }
>(input: StableReadonlyCollectionSyncInput<TSource, TItem>): readonly TItem[] {
  const cachedItemsById = new Map<number, TItem>();
  input.items.forEach((item) => {
    cachedItemsById.set(item.id, item);
  });

  let didChange = input.items.length !== input.sourceItems.length;
  const nextItems = input.sourceItems.map((sourceItem, index) => {
    const cachedItem = cachedItemsById.get(input.getSourceId(sourceItem));
    const nextItem =
      cachedItem && input.areEquivalent(sourceItem, cachedItem)
        ? cachedItem
        : input.createItem(sourceItem);

    if (!didChange && input.items[index] !== nextItem) {
      didChange = true;
    }

    return nextItem;
  });

  return didChange ? createStableReadonlyCollection(nextItems) : input.items;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createStoreHistory<
  TData extends StoreDataShape<TData>,
  TKey extends StoreKey<TData> = StoreKey<TData>
>(
  config: CreateStoreHistoryConfig<TData, TKey>
): StoreHistoryDriver<TData, TKey> {
  const messageChannel =
    config.channel ?? createInMemoryStoreMessageChannel<TData, TKey>();
  const clock = config.clock ?? Date.now;
  let history: readonly StoreHistoryEntry<TData, TKey>[] = [
    {
      id: null,
      index: 0,
      message: null,
      snapshot: config.captureSnapshot(),
      acknowledgedAt: null,
    },
  ];
  let currentIndex = 0;
  let historyCollection = createStableReadonlyCollection(
    history.map((entry) => cloneValue(entry))
  );
  let messageCollection = createStableReadonlyCollection(
    messageChannel.getMessages().map((record) => cloneValue(record))
  );

  const version = signal(0);
  function notifyVersion(): void {
    version.update((v) => v + 1);
  }

  function recordSnapshot(record: StoreMessageRecord<TData, TKey>): void {
    const nextIndex = history.length;
    const nextHistoryEntry: StoreHistoryEntry<TData, TKey> = {
      id: record.id,
      index: nextIndex,
      message: cloneValue(record.message),
      snapshot: config.captureSnapshot(),
      acknowledgedAt: record.acknowledgedAt,
    };

    history = [...history, nextHistoryEntry];
    historyCollection = appendStableReadonlyCollectionItem({
      items: historyCollection,
      item: cloneValue(nextHistoryEntry),
    });
    currentIndex = nextIndex;
  }

  function truncateFutureHistory(): void {
    if (currentIndex === history.length - 1) {
      return;
    }

    history = history.slice(0, currentIndex + 1);
    historyCollection = createStableReadonlyCollection(
      historyCollection.slice(0, currentIndex + 1)
    );
  }

  function ensureIndexInRange(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= history.length) {
      throw new Error(INVALID_HISTORY_INDEX_ERROR);
    }
  }

  function restoreStoreAt(index: number): void {
    ensureIndexInRange(index);
    config.applySnapshot(history[index]!.snapshot);
    currentIndex = index;
    notifyVersion();
  }

  function restoreResource<K extends TKey>(key: K, index?: number): void {
    const targetIndex = index !== undefined ? index : currentIndex;
    ensureIndexInRange(targetIndex);

    // Validate that the key is a valid store key
    const allKeys = new Set(Array.from(config.getAllKeys()));
    if (!allKeys.has(key)) {
      throw new Error(INVALID_STORE_KEY_ERROR);
    }

    const snapshot = history[targetIndex]!.snapshot;
    const snapshotState = snapshot[key] as TData[K] | undefined;

    config.applyKeyUpdate(key, snapshotState ?? createDefaultState() as TData[K]);
    notifyVersion();
  }

  function undo(): boolean {
    if (currentIndex === 0) {
      return false;
    }

    restoreStoreAt(currentIndex - 1);
    return true;
  }

  function redo(): boolean {
    if (currentIndex >= history.length - 1) {
      return false;
    }

    restoreStoreAt(currentIndex + 1);
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
    const messageDeadLetter = getMessageDeadLetterMeta(record.message);
    const nextRecord: StoreMessageRecord<TData, TKey> = {
      ...record,
      message: cloneValue(record.message),
      status,
      attempts: record.attempts + 1,
      lastAttemptedAt: attemptedAt,
      acknowledgedAt:
        status === "acknowledged" ? attemptedAt : record.acknowledgedAt,
      error,
      deadLetter:
        messageDeadLetter ??
        (status === "dead-letter"
          ? {
              error: error ?? MESSAGE_NOT_ACKNOWLEDGED_ERROR,
            }
          : null),
    };

    messageChannel.saveMessage(nextRecord);
    messageCollection = upsertStableReadonlyCollectionItem({
      items: messageCollection,
      item: cloneValue(nextRecord),
    });
    return nextRecord;
  }

  function consumeRecord(
    record: StoreMessageRecord<TData, TKey>,
    options?: {
      readonly recordHistory?: boolean;
    }
  ): boolean {
    const clonedMessage = cloneValue(record.message);
    const attemptedAt = clock();

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

      notifyVersion();
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
      notifyVersion();
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
    if (!record || !hasDeadLetterRecord(record)) {
      return false;
    }

    return consumeRecord(record);
  }

  function replayDeadLetters(): number {
      const ids = messageChannel
      .getMessages()
      .filter((record) => hasDeadLetterRecord(record))
      .map((record) => record.id);
    let acknowledgedCount = 0;

    ids.forEach((id) => {
      if (replayDeadLetter(id)) {
        acknowledgedCount += 1;
      }
    });

    return acknowledgedCount;
  }

  async function replayDeadLetterCommand(
    id: number,
    resolver: (
      entry: Readonly<StoreDeadLetterEntry<TData, TKey>>
    ) => Promise<DeadLetterCommandResolverResult>
  ): Promise<boolean> {
    const record = messageChannel.getMessage(id);
    if (!record || !hasDeadLetterRecord(record)) {
      return false;
    }

    const entry = toDeadLetterEntry(record);
    const result = await resolver(entry);
    if (!result.resolved) {
      return false;
    }

    if (!result.clear) {
      return true;
    }

    const clearedRecord: StoreMessageRecord<TData, TKey> = {
      ...record,
      deadLetter: null,
      error: null,
    };
    messageChannel.saveMessage(clearedRecord);
    messageCollection = upsertStableReadonlyCollectionItem({
      items: messageCollection,
      item: cloneValue(clearedRecord),
    });
    notifyVersion();
    return true;
  }

  const historySignal = computed(() => {
    version();
    return historyCollection;
  });

  const messagesSignal = computed(() => {
    version();
    messageCollection = syncStableReadonlyCollectionById({
      items: messageCollection,
      sourceItems: messageChannel.getMessages(),
      getSourceId: (record) => record.id,
      createItem: (record) => cloneValue(record),
      areEquivalent: areStoreMessageRecordsEquivalent,
    });
    return messageCollection;
  });

  const currentIndexSignal = computed(() => {
    version();
    return currentIndex;
  });

  return {
    historySignal,
    messagesSignal,
    currentIndexSignal,
    publish(message) {
      const record = messageChannel.publish(message);
      messageCollection = appendStableReadonlyCollectionItem({
        items: messageCollection,
        item: cloneValue(record),
      });
      return consumeRecord(record);
    },
    replay(input: number | readonly number[]) {
      return replayByIds(input);
    },
    restoreStoreAt,
    restoreResource,
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
        .filter((record) => hasDeadLetterRecord(record))
        .map((record) => toDeadLetterEntry(record));
    },
    replayDeadLetter,
    replayDeadLetters,
    replayDeadLetterCommand,
    getCurrentIndex() {
      return currentIndex;
    },
  };
}
