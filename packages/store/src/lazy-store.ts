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
  private readonly historyDriver: StoreHistoryDriver<TData>;

  /** @inheritDoc */
  readonly travelTo = (index: number): void =>
    this.historyDriver.travelTo(index);

  /** @inheritDoc */
  readonly undo = (): boolean => this.historyDriver.undo();

  /** @inheritDoc */
  readonly redo = (): boolean => this.historyDriver.redo();

  /** @inheritDoc */
  getMessages(): readonly StoreMessageRecord<TData>[];

  /** @inheritDoc */
  getMessages<K extends StoreKey<TData>>(
    key: K
  ): readonly StoreMessageRecord<TData, K>[];

  getMessages<K extends StoreKey<TData>>(key?: K) {
    if (key === undefined) {
      return this.historyDriver.getMessages();
    }

    return this.historyDriver.getMessages(key);
  }

  /** @inheritDoc */
  readonly getDeadLetters = () => this.historyDriver.getDeadLetters();

  /** @inheritDoc */
  readonly replayDeadLetter = (id: number): boolean =>
    this.historyDriver.replayDeadLetter(id);

  /** @inheritDoc */
  readonly replayDeadLetters = (): number =>
    this.historyDriver.replayDeadLetters();

  /** @inheritDoc */
  readonly getCurrentIndex = () => this.historyDriver.getCurrentIndex();

  /** @inheritDoc */
  readonly history!: Signal<readonly StoreHistoryEntry<TData>[]>;

  /** @inheritDoc */
  readonly messages!: Signal<readonly StoreMessageRecord<TData>[]>;

  /** @inheritDoc */
  readonly currentIndex!: Signal<number>;

  /** @inheritDoc */
  readonly keys!: Signal<readonly StoreKey<TData>[]>;

  private readonly keysSignal = signal<readonly StoreKey<TData>[]>([]);

  /** @inheritDoc */
  replay(id: number): number;

  /** @inheritDoc */
  replay(ids: readonly number[]): number;

  replay(idOrIds: number | readonly number[]): number {
    if (Array.isArray(idOrIds)) {
      return this.historyDriver.replay(idOrIds as readonly number[]);
    }

    return this.historyDriver.replay(idOrIds as number);
  }

  /** @inheritDoc */
  getHistory(): readonly StoreHistoryEntry<TData>[];

  /** @inheritDoc */
  getHistory<K extends StoreKey<TData>>(
    key: K
  ): readonly StoreHistoryEntry<TData, K>[];

  getHistory<K extends StoreKey<TData>>(key?: K) {
    if (key === undefined) {
      return this.historyDriver.getHistory();
    }

    return this.historyDriver.getHistory(key);
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

    this.historyDriver = createStoreHistory<TData>({
      captureSnapshot: () => consumer.createSnapshot(),
      applySnapshot: (snapshot) => consumer.applySnapshot(snapshot),
      applyMessage: (message) => consumer.applyMessage(message),
      channel: options?.channel,
    });

    const self = this as Record<string, unknown>;
    self['history'] = this.historyDriver.historySignal;
    self['messages'] = this.historyDriver.messagesSignal;
    self['currentIndex'] = this.historyDriver.currentIndexSignal;
    self['keys'] = this.keysSignal.asReadonly();

    trackStore(this);
  }

  private getOrCreate<K extends StoreKey<TData>>(
    key: K
  ): WritableSignal<TData[K]> {
    let sig = this.signals.get(key);
    if (!sig) {
      sig = signal<ResourceState<unknown>>(createDefaultState());
      this.signals.set(key, sig);
      this.keysSignal.update((prev) => [...prev, key]);
    }
    return sig as WritableSignal<TData[K]>;
  }

  /** @inheritDoc */
  get<K extends StoreKey<TData>>(key: K): Signal<TData[K]> {
    return this.getOrCreate(key);
  }

  /** @inheritDoc */
  update<K extends StoreKey<TData>>(key: K, newState: Partial<TData[K]>): void {
    this.historyDriver.publish(
      createUpdateMessage<TData, K>(key, cloneValue(newState))
    );
  }

  /** @inheritDoc */
  clear<K extends StoreKey<TData>>(key: K): void {
    this.historyDriver.publish(createClearMessage<TData, K>(key));
  }

  /** @inheritDoc */
  clearAll(): void {
    this.historyDriver.publish(createClearAllMessage<TData>());
  }

  /** @inheritDoc */
  startLoading<K extends StoreKey<TData>>(key: K): void {
    this.historyDriver.publish(createStartLoadingMessage<TData, K>(key));
  }

  /** @inheritDoc */
  stopLoading<K extends StoreKey<TData>>(key: K): void {
    this.historyDriver.publish(createStopLoadingMessage<TData, K>(key));
  }

  /** @inheritDoc */
  updateKeyedOne<K extends StoreKey<TData>>(
    key: K,
    resourceKey: KeyedResourceKey,
    entity: unknown
  ): void {
    this.historyDriver.publish(
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
    this.historyDriver.publish(
      createClearKeyedOneMessage<TData, K>(key, resourceKey)
    );
  }

  /** @inheritDoc */
  startKeyedLoading<K extends StoreKey<TData>>(
    key: K,
    resourceKey: KeyedResourceKey
  ): void {
    this.historyDriver.publish(
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
}
