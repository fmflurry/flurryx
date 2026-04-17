import type { WritableSignal } from "@angular/core";
import {
  type ResourceState,
  type KeyedResourceKey,
  type KeyedResourceData,
  isKeyedResourceData,
  createKeyedResourceData,
} from "@flurryx/core";
import type {
  KeyedResourceEntryKey,
  KeyedResourceEntryValue,
  KeyedStoreKey,
  StoreDataShape,
  StoreKey,
  StoreUpdateOptions,
} from "./types";
import type { StoreMessage, StoreSnapshot } from "./store-messages";
import { cloneValue, createSnapshotRestorePatch } from "./store-clone";

export function createDefaultState<T>(): ResourceState<T> {
  return {
    data: undefined,
    isLoading: false,
    status: undefined,
    errors: undefined,
  };
}

/**
 * Abstraction over how a store manages its writable signals.
 * BaseStore uses a pre-allocated Map; LazyStore creates signals on demand.
 */
export interface SignalAccessor<TData extends StoreDataShape<TData>> {
  getOrCreate<K extends StoreKey<TData>>(key: K): WritableSignal<TData[K]>;
  getAllKeys(): Iterable<StoreKey<TData>>;
}

/**
 * Abstraction over how a store notifies update hooks after state changes.
 */
export interface StoreNotifier<TData extends StoreDataShape<TData>> {
  notify<K extends StoreKey<TData>>(
    key: K,
    next: TData[K],
    prev: TData[K]
  ): void;
}

/**
 * Consumer returned by {@link createStoreMessageConsumer} that both
 * BaseStore and LazyStore delegate to for message application, snapshot
 * capture, and snapshot restore.
 */
export interface StoreMessageConsumer<TData extends StoreDataShape<TData>> {
  applyMessage(message: StoreMessage<TData>): boolean;
  applySnapshot(snapshot: StoreSnapshot<TData>): void;
  applyKeyUpdate<K extends StoreKey<TData>>(
    key: K,
    snapshotState: TData[K]
  ): void;
  createSnapshot(): StoreSnapshot<TData>;
}

type KeyedResourceRecord = Partial<
  Record<KeyedResourceKey, ResourceState<unknown>>
>;

function toKeyedResourceRecord(
  data: KeyedResourceData<KeyedResourceKey, unknown>
): KeyedResourceRecord {
  return data as unknown as KeyedResourceRecord;
}

function hasAnyKeyLoading(data: KeyedResourceRecord): boolean {
  return Object.values(data).some((entry) => entry?.isLoading === true);
}

/**
 * Creates a shared message consumer that encapsulates all apply logic.
 *
 * Both BaseStore and LazyStore delegate to this consumer, eliminating
 * ~300 lines of duplicated implementation between the two stores.
 */
export function createStoreMessageConsumer<TData extends StoreDataShape<TData>>(
  signals: SignalAccessor<TData>,
  notifier: StoreNotifier<TData>
): StoreMessageConsumer<TData> {
  function applyUpdate<K extends StoreKey<TData>>(
    key: K,
    newState: Partial<TData[K]>,
    notify = true
  ): boolean {
    const sig = signals.getOrCreate(key);
    const previousState = sig();
    sig.update((state) => ({ ...state, ...newState }));

    if (notify) {
      const updatedState = sig();
      notifier.notify(key, updatedState, previousState);
    }

    return true;
  }

  function applyClear<K extends StoreKey<TData>>(key: K): boolean {
    const sig = signals.getOrCreate(key);
    const previousState = sig();
    sig.set(createDefaultState() as TData[K]);

    const nextState = sig();
    notifier.notify(key, nextState, previousState);
    return true;
  }

  function applyClearAll(): boolean {
    const keys = Array.from(signals.getAllKeys());
    if (keys.length === 0) {
      return false;
    }

    keys.forEach((key) => {
      applyClear(key);
    });

    return true;
  }

  function applyStartLoading<K extends StoreKey<TData>>(key: K): boolean {
    const sig = signals.getOrCreate(key);
    const previousState = sig();
    sig.update(
      (state) =>
        ({
          ...state,
          status: undefined,
          isLoading: true,
          errors: undefined,
        } as TData[K])
    );

    const nextState = sig();
    notifier.notify(key, nextState, previousState);
    return true;
  }

  function applyStopLoading<K extends StoreKey<TData>>(key: K): boolean {
    const sig = signals.getOrCreate(key);
    const previousState = sig();
    sig.update(
      (state) =>
        ({
          ...state,
          isLoading: false,
        } as TData[K])
    );

    const nextState = sig();
    notifier.notify(key, nextState, previousState);
    return true;
  }

  function applyUpdateKeyedOne<K extends KeyedStoreKey<TData>>(
    key: K,
    resourceKey: KeyedResourceEntryKey<TData, K>,
    entity: KeyedResourceEntryValue<TData, K>
  ): boolean {
    const sig = signals.getOrCreate(key);
    const state = sig();
    const data = isKeyedResourceData(state.data)
      ? toKeyedResourceRecord(state.data)
      : toKeyedResourceRecord(createKeyedResourceData());

    const nextData: KeyedResourceRecord = {
      ...data,
      [resourceKey]: {
        data: entity,
        isLoading: false,
        status: "Success" as const,
        errors: undefined,
      },
    };

    return applyUpdate(key, {
      data: nextData as unknown,
      isLoading: hasAnyKeyLoading(nextData),
      status: undefined,
      errors: undefined,
    } as Partial<TData[K]>);
  }

  function applyClearKeyedOne<K extends KeyedStoreKey<TData>>(
    key: K,
    resourceKey: KeyedResourceEntryKey<TData, K>
  ): boolean {
    const sig = signals.getOrCreate(key);
    const previousState = sig();
    const state = previousState as ResourceState<unknown>;
    if (!isKeyedResourceData(state.data)) {
      return true;
    }

    const data = toKeyedResourceRecord(state.data);
    const nextData = {
      ...data,
    } as KeyedResourceRecord;
    delete nextData[resourceKey];

    sig.update(
      (prev) =>
        ({
          ...prev,
          data: nextData as unknown,
          status: undefined,
          isLoading: hasAnyKeyLoading(nextData),
          errors: undefined,
        } as TData[K])
    );

    const updatedState = sig();
    notifier.notify(key, updatedState, previousState);
    return true;
  }

  function applyStartKeyedLoading<K extends KeyedStoreKey<TData>>(
    key: K,
    resourceKey: KeyedResourceEntryKey<TData, K>
  ): boolean {
    const sig = signals.getOrCreate(key);
    const previousState = sig();
    const state = previousState as ResourceState<unknown>;

    if (state.data !== undefined && !isKeyedResourceData(state.data)) {
      return applyStartLoading(key);
    }

    const data = isKeyedResourceData(state.data)
      ? toKeyedResourceRecord(state.data)
      : toKeyedResourceRecord(createKeyedResourceData());
    const currentResourceState = data[resourceKey];
    const nextResourceState =
      currentResourceState ??
      (createDefaultState<KeyedResourceEntryValue<TData, K>>() as ResourceState<unknown>);
    const nextData: KeyedResourceRecord = {
      ...data,
      [resourceKey]: {
        ...nextResourceState,
        isLoading: true,
        status: undefined,
        errors: undefined,
      },
    };

    sig.update(
      (previous) =>
        ({
          ...previous,
          data: nextData,
          status: undefined,
          isLoading: hasAnyKeyLoading(nextData),
          errors: undefined,
        } as TData[K])
    );

    const updatedState = sig();
    notifier.notify(key, updatedState, previousState as TData[K]);
    return true;
  }

  function applyEnsureKeyedSlot<K extends KeyedStoreKey<TData>>(
    key: K,
    resourceKey: KeyedResourceEntryKey<TData, K>
  ): boolean {
    const sig = signals.getOrCreate(key);
    const previousState = sig();
    const state = previousState as ResourceState<unknown>;

    if (state.data !== undefined && !isKeyedResourceData(state.data)) {
      return true;
    }

    const data = isKeyedResourceData(state.data)
      ? toKeyedResourceRecord(state.data)
      : toKeyedResourceRecord(createKeyedResourceData());

    if (data[resourceKey] !== undefined) {
      return true;
    }

    const nextData: KeyedResourceRecord = {
      ...data,
      [resourceKey]: createDefaultState<
        KeyedResourceEntryValue<TData, K>
      >() as ResourceState<unknown>,
    };

    sig.update(
      (previous) =>
        ({
          ...previous,
          data: nextData as unknown,
          isLoading: hasAnyKeyLoading(nextData),
        } as TData[K])
    );

    const updatedState = sig();
    notifier.notify(key, updatedState, previousState);
    return true;
  }

  function applyMessage(message: StoreMessage<TData>): boolean {
    switch (message.type) {
      case "update":
        return applyUpdate(message.key, cloneValue(message.state));
      case "clear":
        return applyClear(message.key);
      case "clearAll":
        return applyClearAll();
      case "startLoading":
        return applyStartLoading(message.key);
      case "stopLoading":
        return applyStopLoading(message.key);
      case "updateKeyedOne":
        return applyUpdateKeyedOne(
          message.key,
          message.resourceKey,
          cloneValue(message.entity)
        );
      case "clearKeyedOne":
        return applyClearKeyedOne(message.key, message.resourceKey);
      case "startKeyedLoading":
        return applyStartKeyedLoading(message.key, message.resourceKey);
      case "ensureKeyedSlot":
        return applyEnsureKeyedSlot(message.key, message.resourceKey);
    }
  }

  function applySnapshot(snapshot: StoreSnapshot<TData>): void {
    const keys = new Set<string>([
      ...Array.from(signals.getAllKeys()),
      ...Object.keys(snapshot),
    ]);

    keys.forEach((rawKey) => {
      const key = rawKey as StoreKey<TData>;
      const sig = signals.getOrCreate(key);
      const snapshotState =
        snapshot[key] ?? (createDefaultState() as TData[typeof key]);

      applyUpdate(key, createSnapshotRestorePatch(sig(), snapshotState), true);
    });
  }

  function captureSnapshot(): StoreSnapshot<TData> {
    const entries = Array.from(signals.getAllKeys()).map((key) => [
      key,
      cloneValue(signals.getOrCreate(key)()),
    ]);

    return Object.fromEntries(entries) as StoreSnapshot<TData>;
  }

  function applyKeyUpdate<K extends StoreKey<TData>>(
    key: K,
    snapshotState: TData[K]
  ): void {
    const sig = signals.getOrCreate(key);
    const currentState = sig();
    const patch = createSnapshotRestorePatch(currentState, snapshotState);
    applyUpdate(key, patch, true);
  }

  return {
    applyMessage,
    applySnapshot,
    applyKeyUpdate,
    createSnapshot: captureSnapshot,
  };
}

// ---------------------------------------------------------------------------
// Typed message factory functions — eliminate `as StoreMessage<TData>` casts
// ---------------------------------------------------------------------------

export function createUpdateMessage<
  TData extends StoreDataShape<TData>,
  K extends StoreKey<TData>
>(
  key: K,
  state: Partial<TData[K]>,
  options?: StoreUpdateOptions
): StoreMessage<TData> {
  return {
    type: "update",
    key,
    state,
    deadLetter: options?.deadLetter,
  } as StoreMessage<TData>;
}

export function createClearMessage<
  TData extends StoreDataShape<TData>,
  K extends StoreKey<TData>
>(key: K): StoreMessage<TData> {
  return { type: "clear", key } as StoreMessage<TData>;
}

export function createClearAllMessage<
  TData extends StoreDataShape<TData>
>(): StoreMessage<TData> {
  return { type: "clearAll" };
}

export function createStartLoadingMessage<
  TData extends StoreDataShape<TData>,
  K extends StoreKey<TData>
>(key: K): StoreMessage<TData> {
  return { type: "startLoading", key } as StoreMessage<TData>;
}

export function createStopLoadingMessage<
  TData extends StoreDataShape<TData>,
  K extends StoreKey<TData>
>(key: K): StoreMessage<TData> {
  return { type: "stopLoading", key } as StoreMessage<TData>;
}

export function createUpdateKeyedOneMessage<
  TData extends StoreDataShape<TData>,
  K extends KeyedStoreKey<TData>
>(
  key: K,
  resourceKey: KeyedResourceEntryKey<TData, K>,
  entity: KeyedResourceEntryValue<TData, K>
): StoreMessage<TData, K> {
  return {
    type: "updateKeyedOne",
    key,
    resourceKey,
    entity,
  } as StoreMessage<TData, K>;
}

export function createClearKeyedOneMessage<
  TData extends StoreDataShape<TData>,
  K extends KeyedStoreKey<TData>
>(
  key: K,
  resourceKey: KeyedResourceEntryKey<TData, K>
): StoreMessage<TData, K> {
  return {
    type: "clearKeyedOne",
    key,
    resourceKey,
  } as StoreMessage<TData, K>;
}

export function createStartKeyedLoadingMessage<
  TData extends StoreDataShape<TData>,
  K extends KeyedStoreKey<TData>
>(
  key: K,
  resourceKey: KeyedResourceEntryKey<TData, K>
): StoreMessage<TData, K> {
  return {
    type: "startKeyedLoading",
    key,
    resourceKey,
  } as StoreMessage<TData, K>;
}

export function createEnsureKeyedSlotMessage<
  TData extends StoreDataShape<TData>,
  K extends KeyedStoreKey<TData>
>(
  key: K,
  resourceKey: KeyedResourceEntryKey<TData, K>
): StoreMessage<TData, K> {
  return {
    type: "ensureKeyedSlot",
    key,
    resourceKey,
  } as StoreMessage<TData, K>;
}
