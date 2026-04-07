import { signal, type Signal, WritableSignal } from "@angular/core";
import { ResourceState, type KeyedResourceKey } from "@flurryx/core";
import type { IStore, StoreDataShape, StoreKey, StoreOptions } from "./types";
import { cloneValue } from "./store-clone";
import {
  createStoreHistory,
  type StoreHistoryDriver,
  type StoreHistoryEntry,
} from "./store-replay";
import type { StoreMessageRecord } from "./store-channels";
import { trackStore } from "./store-registry";
import {
  createDefaultState,
  createStoreMessageConsumer,
  createUpdateMessage,
  createClearMessage,
  createClearAllMessage,
  createStartLoadingMessage,
  createStopLoadingMessage,
  createUpdateKeyedOneMessage,
  createClearKeyedOneMessage,
  createStartKeyedLoadingMessage,
} from "./store-message-consumer";

type UpdateHooksMap = Map<
  unknown,
  Array<
    (
      nextState: ResourceState<unknown>,
      previousState: ResourceState<unknown>
    ) => void
  >
>;

const updateHooksMap = new WeakMap<object, UpdateHooksMap>();

/**
 * Abstract base class for flurryx stores.
 *
 * Backed by Angular `signal()` per slot, providing read-only `Signal` access
 * and immutable updates. All writes go through the store's own methods to
 * enforce single-owner encapsulation.
 *
 * Use the {@link Store} builder to create instances — do not subclass directly.
 *
 * @template TEnum - Record mapping slot names to their string/number keys.
 * @template TData - Record mapping slot names to `ResourceState<T>` types.
 */
export abstract class BaseStore<
  TEnum extends Record<string, string | number>,
  TData extends StoreDataShape<TData> & {
    [K in keyof TEnum]: ResourceState<unknown>;
  }
> implements IStore<TData>
{
  private readonly signalsState = new Map<
    string,
    WritableSignal<ResourceState<unknown>>
  >();
  private readonly storeKeys: readonly StoreKey<TData>[];
  private readonly history: StoreHistoryDriver<TData>;

  readonly travelTo: StoreHistoryDriver<TData>["travelTo"];
  readonly undo: StoreHistoryDriver<TData>["undo"];
  readonly redo: StoreHistoryDriver<TData>["redo"];
  readonly getDeadLetters: StoreHistoryDriver<TData>["getDeadLetters"];
  readonly replayDeadLetter: StoreHistoryDriver<TData>["replayDeadLetter"];
  readonly replayDeadLetters: StoreHistoryDriver<TData>["replayDeadLetters"];
  readonly getCurrentIndex: StoreHistoryDriver<TData>["getCurrentIndex"];

  /** @inheritDoc */
  replay(id: number): number;

  /** @inheritDoc */
  replay(ids: readonly number[]): number;

  replay(idOrIds: number | readonly number[]): number {
    if (Array.isArray(idOrIds)) {
      return this.history.replay(idOrIds as readonly number[]);
    }

    return this.history.replay(idOrIds as number);
  }

  /** @inheritDoc */
  getHistory(): readonly StoreHistoryEntry<TData>[];

  /** @inheritDoc */
  getHistory<K extends StoreKey<TData>>(
    key: K
  ): readonly StoreHistoryEntry<TData, K>[];

  getHistory<K extends StoreKey<TData>>(key?: K) {
    if (key === undefined) {
      return this.history.getHistory();
    }

    return this.history.getHistory(key);
  }

  /** @inheritDoc */
  getMessages(): readonly StoreMessageRecord<TData>[];

  /** @inheritDoc */
  getMessages<K extends StoreKey<TData>>(
    key: K
  ): readonly StoreMessageRecord<TData, K>[];

  getMessages<K extends StoreKey<TData>>(key?: K) {
    if (key === undefined) {
      return this.history.getMessages();
    }

    return this.history.getMessages(key);
  }

  protected constructor(
    protected readonly storeEnum: TEnum,
    options?: StoreOptions<TData>
  ) {
    this.storeKeys = Object.keys(storeEnum) as StoreKey<TData>[];
    this.initializeState();
    updateHooksMap.set(this, new Map());

    const consumer = createStoreMessageConsumer<TData>(
      {
        getOrCreate: <K extends StoreKey<TData>>(key: K) =>
          this.signalsState.get(key) as WritableSignal<TData[K]>,
        getAllKeys: () => this.storeKeys,
      },
      {
        notify: <K extends StoreKey<TData>>(
          key: K,
          next: TData[K],
          prev: TData[K]
        ) => this.notifyUpdateHooks(key, next, prev),
      }
    );

    this.history = createStoreHistory<TData>({
      captureSnapshot: () => consumer.createSnapshot(),
      applySnapshot: (snapshot) => consumer.applySnapshot(snapshot),
      applyMessage: (message) => consumer.applyMessage(message),
      channel: options?.channel,
    });

    this.travelTo = (index) => this.history.travelTo(index);
    this.undo = () => this.history.undo();
    this.redo = () => this.history.redo();
    this.getDeadLetters = () => this.history.getDeadLetters();
    this.replayDeadLetter = (id) => this.history.replayDeadLetter(id);
    this.replayDeadLetters = () => this.history.replayDeadLetters();
    this.getCurrentIndex = () => this.history.getCurrentIndex();

    trackStore(this);
  }

  /**
   * Returns a **read-only** `Signal` for the given store slot.
   *
   * @param key - The slot name to read.
   * @returns A `Signal` wrapping the slot's current {@link ResourceState}.
   */
  get<K extends StoreKey<TData>>(key: K): Signal<TData[K]> {
    return this.signalsState.get(key.toString()) as unknown as Signal<TData[K]>;
  }

  /**
   * Registers a callback fired after every `update` or `clear` on the given slot.
   *
   * @param key - The slot to watch.
   * @param callback - Receives the new state and the previous state.
   * @returns A cleanup function that removes the listener when called.
   */
  onUpdate<K extends StoreKey<TData>>(
    key: K,
    callback: (state: TData[K], previousState: TData[K]) => void
  ): () => void {
    const hooks = updateHooksMap.get(this)!;
    if (!hooks.has(key)) {
      hooks.set(key, []);
    }
    hooks
      .get(key)!
      .push(
        callback as (
          nextState: ResourceState<unknown>,
          previousState: ResourceState<unknown>
        ) => void
      );

    return () => {
      const hooksMap = hooks.get(key);
      if (!hooksMap) {
        return;
      }
      const index = hooksMap.indexOf(
        callback as (
          nextState: ResourceState<unknown>,
          previousState: ResourceState<unknown>
        ) => void
      );
      if (index > -1) {
        hooksMap.splice(index, 1);
      }
    };
  }

  /**
   * Partially updates a slot by merging `newState` into the current value (immutable spread).
   *
   * @param key - The slot to update.
   * @param newState - Partial state to merge (e.g. `{ data: newData, status: 'Success' }`).
   */
  update<K extends StoreKey<TData>>(key: K, newState: Partial<TData[K]>): void {
    this.history.publish(
      createUpdateMessage<TData, K>(key, cloneValue(newState))
    );
  }

  /** Resets every slot in this store to its initial idle state. */
  clearAll(): void {
    this.history.publish(createClearAllMessage<TData>());
  }

  /**
   * Resets a single slot to `{ data: undefined, isLoading: false, status: undefined, errors: undefined }`.
   *
   * @param key - The slot to clear.
   */
  clear<K extends StoreKey<TData>>(key: K): void {
    this.history.publish(createClearMessage<TData, K>(key));
  }

  /**
   * Marks a slot as loading: sets `isLoading: true` and clears `status` and `errors`.
   *
   * @param key - The slot to mark as loading.
   */
  startLoading<K extends StoreKey<TData>>(key: K): void {
    this.history.publish(createStartLoadingMessage<TData, K>(key));
  }

  /**
   * Marks a slot as no longer loading: sets `isLoading: false`.
   * Does **not** clear `status` or `errors`.
   *
   * @param key - The slot to stop loading.
   */
  stopLoading<K extends StoreKey<TData>>(key: K): void {
    this.history.publish(createStopLoadingMessage<TData, K>(key));
  }

  /**
   * Merges a single entity into a {@link KeyedResourceData} slot.
   * Sets its status to `'Success'` and clears per-key errors.
   * The top-level `isLoading` is recalculated based on remaining loading keys.
   *
   * @param key - The keyed slot name.
   * @param resourceKey - The entity identifier (e.g. `'inv-123'`).
   * @param entity - The entity value to store.
   */
  updateKeyedOne<K extends StoreKey<TData>>(
    key: K,
    resourceKey: KeyedResourceKey,
    entity: unknown
  ): void {
    this.history.publish(
      createUpdateKeyedOneMessage<TData, K>(
        key,
        resourceKey,
        cloneValue(entity)
      )
    );
  }

  /**
   * Removes a single entity from a {@link KeyedResourceData} slot,
   * including its loading flag, status, and errors.
   * Recalculates the top-level `isLoading` from the remaining keys.
   *
   * @param key - The keyed slot name.
   * @param resourceKey - The entity identifier to remove.
   */
  clearKeyedOne<K extends StoreKey<TData>>(
    key: K,
    resourceKey: KeyedResourceKey
  ): void {
    this.history.publish(
      createClearKeyedOneMessage<TData, K>(key, resourceKey)
    );
  }

  /**
   * Marks a single entity within a keyed slot as loading.
   * Clears its status and errors. If the slot data is not yet a {@link KeyedResourceData},
   * falls back to `startLoading(key)`.
   *
   * @param key - The keyed slot name.
   * @param resourceKey - The entity identifier to mark as loading.
   */
  startKeyedLoading<K extends StoreKey<TData>>(
    key: K,
    resourceKey: KeyedResourceKey
  ): void {
    this.history.publish(
      createStartKeyedLoadingMessage<TData, K>(key, resourceKey)
    );
  }

  private notifyUpdateHooks<K extends StoreKey<TData>>(
    key: K,
    nextState: TData[K],
    previousState: TData[K]
  ): void {
    const hooks = updateHooksMap.get(this);
    const keyHooks = hooks?.get(key);
    if (!keyHooks) {
      return;
    }

    const errors: unknown[] = [];

    keyHooks.forEach((hook) => {
      try {
        hook(
          nextState as ResourceState<unknown>,
          previousState as ResourceState<unknown>
        );
      } catch (error: unknown) {
        errors.push(error);
      }
    });

    if (errors.length > 0) {
      queueMicrotask(() => {
        if (errors.length === 1) {
          throw errors[0];
        }
        throw new AggregateError(
          errors,
          `${errors.length} onUpdate hooks threw for key "${String(key)}"`
        );
      });
    }
  }

  private initializeState(): void {
    this.storeKeys.forEach((key) => {
      this.signalsState.set(
        key,
        signal<TData[typeof key]>(createDefaultState() as TData[typeof key])
      );
    });
  }
}
