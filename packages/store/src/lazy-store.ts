import { signal, WritableSignal } from '@angular/core';
import type { ResourceState } from '@flurryx/core';
import type { IStore } from './types';

type UpdateCallback = (
  nextState: ResourceState<unknown>,
  previousState: ResourceState<unknown>
) => void;

function createDefaultState<T>(): ResourceState<T> {
  return {
    data: undefined,
    isLoading: false,
    status: undefined,
    errors: undefined,
  };
}

/**
 * Lazy store that creates signals on first access.
 * Used by the `Store.for<Config>().build()` API where keys are
 * known only at the type level (no runtime enum).
 */
export class LazyStore<
  TData extends Record<string, ResourceState<unknown>>,
> implements IStore<TData>
{
  private readonly signals = new Map<string, WritableSignal<ResourceState<unknown>>>();
  private readonly hooks = new Map<string, UpdateCallback[]>();

  private getOrCreate<K extends keyof TData & string>(
    key: K
  ): WritableSignal<TData[K]> {
    let sig = this.signals.get(key);
    if (!sig) {
      sig = signal<ResourceState<unknown>>(createDefaultState());
      this.signals.set(key, sig);
    }
    return sig as WritableSignal<TData[K]>;
  }

  get<K extends keyof TData & string>(key: K): WritableSignal<TData[K]> {
    return this.getOrCreate(key);
  }

  update<K extends keyof TData & string>(
    key: K,
    newState: Partial<TData[K]>
  ): void {
    const sig = this.getOrCreate(key);
    const previousState = sig();
    sig.update((state) => ({ ...state, ...newState }));
    const nextState = sig();
    this.notifyHooks(key, nextState, previousState);
  }

  clear<K extends keyof TData & string>(key: K): void {
    const sig = this.getOrCreate(key);
    const previousState = sig();
    sig.set(createDefaultState() as TData[K]);
    const nextState = sig();
    this.notifyHooks(key, nextState, previousState);
  }

  clearAll(): void {
    for (const key of this.signals.keys()) {
      this.clear(key as keyof TData & string);
    }
  }

  startLoading<K extends keyof TData & string>(key: K): void {
    const sig = this.getOrCreate(key);
    sig.update(
      (state) =>
        ({
          ...state,
          status: undefined,
          isLoading: true,
          errors: undefined,
        }) as TData[K]
    );
  }

  stopLoading<K extends keyof TData & string>(key: K): void {
    const sig = this.getOrCreate(key);
    sig.update(
      (state) =>
        ({
          ...state,
          isLoading: false,
          status: undefined,
          errors: undefined,
        }) as TData[K]
    );
  }

  onUpdate<K extends keyof TData & string>(
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

  private notifyHooks<K extends keyof TData & string>(
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
