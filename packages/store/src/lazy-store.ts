import { signal, type Signal, WritableSignal } from "@angular/core";
import { type ResourceState, type KeyedResourceKey } from "@flurryx/core";
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

type UpdateCallback = (
  nextState: ResourceState<unknown>,
  previousState: ResourceState<unknown>
) => void;

/**
 * Lazy store that creates signals on first access.
 * Used by the `Store.for<Config>().build()` API where keys are
 * known only at the type level (no runtime enum).
 */
export class LazyStore<TData extends StoreDataShape<TData>>
  implements IStore<TData>
{
  private readonly signals = new Map<
    string,
    WritableSignal<ResourceState<unknown>>
  >();
  private readonly hooks = new Map<string, UpdateCallback[]>();
  private readonly history: StoreHistoryDriver<TData>;

  readonly travelTo = (index: number): void => this.history.travelTo(index);

  readonly undo = (): boolean => this.history.undo();

  readonly redo = (): boolean => this.history.redo();

  getMessages(): readonly StoreMessageRecord<TData>[];

  getMessages<K extends StoreKey<TData>>(
    key: K
  ): readonly StoreMessageRecord<TData, K>[];

  getMessages<K extends StoreKey<TData>>(key?: K) {
    if (key === undefined) {
      return this.history.getMessages();
    }

    return this.history.getMessages(key);
  }

  readonly getDeadLetters = () => this.history.getDeadLetters();

  readonly replayDeadLetter = (id: number): boolean =>
    this.history.replayDeadLetter(id);

  readonly replayDeadLetters = (): number => this.history.replayDeadLetters();

  readonly getCurrentIndex = () => this.history.getCurrentIndex();

  replay(id: number): number;

  replay(ids: readonly number[]): number;

  replay(idOrIds: number | readonly number[]): number {
    if (Array.isArray(idOrIds)) {
      return this.history.replay(idOrIds as readonly number[]);
    }

    return this.history.replay(idOrIds as number);
  }

  getHistory(): readonly StoreHistoryEntry<TData>[];

  getHistory<K extends StoreKey<TData>>(
    key: K
  ): readonly StoreHistoryEntry<TData, K>[];

  getHistory<K extends StoreKey<TData>>(key?: K) {
    if (key === undefined) {
      return this.history.getHistory();
    }

    return this.history.getHistory(key);
  }

  constructor(options?: StoreOptions<TData>) {
    const consumer = createStoreMessageConsumer<TData>(
      {
        getOrCreate: <K extends StoreKey<TData>>(key: K) =>
          this.getOrCreate(key),
        getAllKeys: () => this.signals.keys() as Iterable<StoreKey<TData>>,
      },
      {
        notify: <K extends StoreKey<TData>>(
          key: K,
          next: TData[K],
          prev: TData[K]
        ) => this.notifyHooks(key, next, prev),
      }
    );

    this.history = createStoreHistory<TData>({
      captureSnapshot: () => consumer.createSnapshot(),
      applySnapshot: (snapshot) => consumer.applySnapshot(snapshot),
      applyMessage: (message) => consumer.applyMessage(message),
      channel: options?.channel,
    });

    trackStore(this);
  }

  private getOrCreate<K extends StoreKey<TData>>(
    key: K
  ): WritableSignal<TData[K]> {
    let sig = this.signals.get(key);
    if (!sig) {
      sig = signal<ResourceState<unknown>>(createDefaultState());
      this.signals.set(key, sig);
    }
    return sig as WritableSignal<TData[K]>;
  }

  /** @inheritDoc */
  get<K extends StoreKey<TData>>(key: K): Signal<TData[K]> {
    return this.getOrCreate(key);
  }

  /** @inheritDoc */
  update<K extends StoreKey<TData>>(key: K, newState: Partial<TData[K]>): void {
    this.history.publish(
      createUpdateMessage<TData, K>(key, cloneValue(newState))
    );
  }

  /** @inheritDoc */
  clear<K extends StoreKey<TData>>(key: K): void {
    this.history.publish(createClearMessage<TData, K>(key));
  }

  /** @inheritDoc */
  clearAll(): void {
    this.history.publish(createClearAllMessage<TData>());
  }

  /** @inheritDoc */
  startLoading<K extends StoreKey<TData>>(key: K): void {
    this.history.publish(createStartLoadingMessage<TData, K>(key));
  }

  /** @inheritDoc */
  stopLoading<K extends StoreKey<TData>>(key: K): void {
    this.history.publish(createStopLoadingMessage<TData, K>(key));
  }

  /** @inheritDoc */
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

  /** @inheritDoc */
  clearKeyedOne<K extends StoreKey<TData>>(
    key: K,
    resourceKey: KeyedResourceKey
  ): void {
    this.history.publish(
      createClearKeyedOneMessage<TData, K>(key, resourceKey)
    );
  }

  /** @inheritDoc */
  startKeyedLoading<K extends StoreKey<TData>>(
    key: K,
    resourceKey: KeyedResourceKey
  ): void {
    this.history.publish(
      createStartKeyedLoadingMessage<TData, K>(key, resourceKey)
    );
  }

  /** @inheritDoc */
  onUpdate<K extends StoreKey<TData>>(
    key: K,
    callback: (state: TData[K], previousState: TData[K]) => void
  ): () => void {
    if (!this.hooks.has(key)) {
      this.hooks.set(key, []);
    }
    const typedCallback = callback as UpdateCallback;
    this.hooks.get(key)!.push(typedCallback);

    return () => {
      const keyHooks = this.hooks.get(key);
      if (!keyHooks) {
        return;
      }
      const index = keyHooks.indexOf(typedCallback);
      if (index > -1) {
        keyHooks.splice(index, 1);
      }
    };
  }

  private notifyHooks<K extends StoreKey<TData>>(
    key: K,
    nextState: TData[K],
    previousState: TData[K]
  ): void {
    const keyHooks = this.hooks.get(key);
    if (!keyHooks) {
      return;
    }
    keyHooks.forEach((hook) =>
      hook(
        nextState as ResourceState<unknown>,
        previousState as ResourceState<unknown>
      )
    );
  }
}
