import { signal, type Signal, WritableSignal } from "@angular/core";
import {
  isAnyKeyLoading,
  isKeyedResourceData,
  createKeyedResourceData,
  type ResourceState,
  type KeyedResourceKey,
} from "@flurryx/core";
import type { IStore } from "./types";

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
export class LazyStore<TData extends Record<string, ResourceState<unknown>>>
  implements IStore<TData>
{
  private readonly signals = new Map<
    string,
    WritableSignal<ResourceState<unknown>>
  >();
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

  get<K extends keyof TData & string>(key: K): Signal<TData[K]> {
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
        } as TData[K])
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
        } as TData[K])
    );
  }

  updateKeyedOne<K extends keyof TData & string>(
    key: K,
    resourceKey: KeyedResourceKey,
    entity: unknown
  ): void {
    const sig = this.getOrCreate(key);
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

    this.update(key, {
      data: nextData as unknown,
      isLoading: isAnyKeyLoading(nextData.isLoading),
      status: undefined,
      errors: undefined,
    } as Partial<TData[K]>);
  }

  clearKeyedOne<K extends keyof TData & string>(
    key: K,
    resourceKey: KeyedResourceKey
  ): void {
    const sig = this.getOrCreate(key);
    const state = sig();
    if (!isKeyedResourceData(state.data)) {
      return;
    }

    const data = state.data;
    const previousState = state as TData[K];

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

    const updatedState = sig() as TData[K];
    this.notifyHooks(key, updatedState, previousState);
  }

  startKeyedLoading<K extends keyof TData & string>(
    key: K,
    resourceKey: KeyedResourceKey
  ): void {
    const sig = this.getOrCreate(key);
    const state = sig();
    if (!isKeyedResourceData(state.data)) {
      this.startLoading(key);
      return;
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

    const updatedState = sig() as TData[K];
    this.notifyHooks(key, updatedState, previousState);
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
