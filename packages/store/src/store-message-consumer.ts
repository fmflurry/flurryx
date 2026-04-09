import type { WritableSignal } from "@angular/core";
import {
  type ResourceState,
  type KeyedResourceKey,
  isKeyedResourceData,
  createKeyedResourceData,
  isAnyKeyLoading,
} from "@flurryx/core";
import type { StoreDataShape, StoreKey } from "./types";
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
    sig.update(
      (state) =>
        ({
          ...state,
          status: undefined,
          isLoading: true,
          errors: undefined,
        } as TData[K])
    );
    return true;
  }

  function applyStopLoading<K extends StoreKey<TData>>(key: K): boolean {
    const sig = signals.getOrCreate(key);
    sig.update(
      (state) =>
        ({
          ...state,
          isLoading: false,
        } as TData[K])
    );
    return true;
  }

  function applyUpdateKeyedOne<K extends StoreKey<TData>>(
    key: K,
    resourceKey: KeyedResourceKey,
    entity: unknown
  ): boolean {
    const sig = signals.getOrCreate(key);
    const state = sig();
    const data = isKeyedResourceData(state.data)
      ? state.data
      : createKeyedResourceData();

    const nextErrors = { ...data.errors };
    delete nextErrors[resourceKey];

    const nextData = {
      ...data,
      entities: { ...data.entities, [resourceKey]: entity },
      isLoading: { ...data.isLoading, [resourceKey]: false },
      status: { ...data.status, [resourceKey]: "Success" as const },
      errors: nextErrors,
    };

    return applyUpdate(key, {
      data: nextData as unknown,
      isLoading: isAnyKeyLoading(nextData.isLoading),
      status: undefined,
      errors: undefined,
    } as Partial<TData[K]>);
  }

  function applyClearKeyedOne<K extends StoreKey<TData>>(
    key: K,
    resourceKey: KeyedResourceKey
  ): boolean {
    const sig = signals.getOrCreate(key);
    const previousState = sig();
    const state = previousState as ResourceState<unknown>;
    if (!isKeyedResourceData(state.data)) {
      return true;
    }

    const data = state.data;

    const nextEntities = { ...data.entities };
    delete nextEntities[resourceKey];

    const nextIsLoading = { ...data.isLoading };
    delete nextIsLoading[resourceKey];

    const nextStatus = { ...data.status };
    delete nextStatus[resourceKey];

    const nextErrors = { ...data.errors };
    delete nextErrors[resourceKey];

    const nextData = {
      ...data,
      entities: nextEntities,
      isLoading: nextIsLoading,
      status: nextStatus,
      errors: nextErrors,
    };

    sig.update(
      (prev) =>
        ({
          ...prev,
          data: nextData as unknown,
          status: undefined,
          isLoading: isAnyKeyLoading(nextIsLoading),
          errors: undefined,
        } as TData[K])
    );

    const updatedState = sig();
    notifier.notify(key, updatedState, previousState);
    return true;
  }

  function applyStartKeyedLoading<K extends StoreKey<TData>>(
    key: K,
    resourceKey: KeyedResourceKey
  ): boolean {
    const sig = signals.getOrCreate(key);
    const state = sig();
    if (!isKeyedResourceData(state.data)) {
      return applyStartLoading(key);
    }

    const previousState = state as TData[K];
    const data = state.data;

    const nextIsLoading = {
      ...data.isLoading,
      [resourceKey]: true,
    } as typeof data.isLoading;

    const nextStatus: typeof data.status = { ...data.status };
    delete nextStatus[resourceKey];

    const nextErrors: typeof data.errors = { ...data.errors };
    delete nextErrors[resourceKey];

    const nextData = {
      ...data,
      isLoading: nextIsLoading,
      status: nextStatus,
      errors: nextErrors,
    };

    sig.update(
      (previous) =>
        ({
          ...previous,
          data: nextData,
          status: undefined,
          isLoading: isAnyKeyLoading(nextIsLoading),
          errors: undefined,
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
>(key: K, state: Partial<TData[K]>): StoreMessage<TData> {
  return { type: "update", key, state } as StoreMessage<TData>;
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
  K extends StoreKey<TData>
>(key: K, resourceKey: KeyedResourceKey, entity: unknown): StoreMessage<TData> {
  return {
    type: "updateKeyedOne",
    key,
    resourceKey,
    entity,
  } as unknown as StoreMessage<TData>;
}

export function createClearKeyedOneMessage<
  TData extends StoreDataShape<TData>,
  K extends StoreKey<TData>
>(key: K, resourceKey: KeyedResourceKey): StoreMessage<TData> {
  return {
    type: "clearKeyedOne",
    key,
    resourceKey,
  } as unknown as StoreMessage<TData>;
}

export function createStartKeyedLoadingMessage<
  TData extends StoreDataShape<TData>,
  K extends StoreKey<TData>
>(key: K, resourceKey: KeyedResourceKey): StoreMessage<TData> {
  return {
    type: "startKeyedLoading",
    key,
    resourceKey,
  } as unknown as StoreMessage<TData>;
}
