import { signal, computed, type Signal } from "@angular/core";
import type { StoreDataShape, StoreKey } from "./types";
import type {
  StoreMessage,
  StoreSnapshot,
  StoreMessageStatus,
} from "./store-messages";
import {
  INVALID_HISTORY_INDEX_ERROR,
  INVALID_HISTORY_MESSAGE_ID_ERROR,
  MESSAGE_NOT_ACKNOWLEDGED_ERROR,
} from "./store-messages";
import { cloneValue } from "./store-clone";
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
  /** Snapshot position used by `travelTo(index)`, `undo()`, and `redo()`. */
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
  return {
    id: record.id,
    message: cloneValue(record.message),
    attempts: record.attempts,
    error: record.error ?? MESSAGE_NOT_ACKNOWLEDGED_ERROR,
    failedAt: record.lastAttemptedAt ?? record.createdAt,
  };
}

function createStableReadonlyCollection<TItem>(
  _items: readonly TItem[]
): readonly TItem[] {
  throw new Error("Not implemented");
}

function appendStableReadonlyCollectionItem<TItem>(
  _input: StableReadonlyCollectionAppendInput<TItem>
): readonly TItem[] {
  throw new Error("Not implemented");
}

function upsertStableReadonlyCollectionItem<
  TItem extends {
    readonly id: number;
  }
>(_input: StableReadonlyCollectionUpsertInput<TItem>): readonly TItem[] {
  throw new Error("Not implemented");
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

  const version = signal(0);
  function notifyVersion(): void {
    version.update((v) => v + 1);
  }

  function recordSnapshot(record: StoreMessageRecord<TData, TKey>): void {
    const nextIndex = history.length;
    history = [
      ...history,
      {
        id: record.id,
        index: nextIndex,
        message: cloneValue(record.message),
        snapshot: config.captureSnapshot(),
        acknowledgedAt: record.acknowledgedAt,
      },
    ];
    currentIndex = nextIndex;
  }

  function truncateFutureHistory(): void {
    if (currentIndex === history.length - 1) {
      return;
    }

    history = history.slice(0, currentIndex + 1);
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
    notifyVersion();
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
      acknowledgedAt:
        status === "acknowledged" ? attemptedAt : record.acknowledgedAt,
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

  const historySignal = computed(() => {
    version();
    return history.map((entry) => cloneValue(entry));
  });

  const messagesSignal = computed(() => {
    version();
    return messageChannel.getMessages().map((record) => cloneValue(record));
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
