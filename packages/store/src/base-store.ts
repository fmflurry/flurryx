import { signal, type Signal, WritableSignal } from "@angular/core";
import {
  ResourceState,
  isAnyKeyLoading,
  isKeyedResourceData,
  createKeyedResourceData,
  type KeyedResourceKey,
} from "@flurryx/core";
import type { IStore } from "./types";
import { trackStore } from "./store-registry";

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
  TData extends { [K in keyof TEnum]: ResourceState<unknown> }
> implements IStore<TData>
{
  private readonly signalsState = new Map<
    keyof TEnum,
    WritableSignal<TData[keyof TEnum]>
  >();

  protected constructor(protected readonly storeEnum: TEnum) {
    this.initializeState();
    updateHooksMap.set(this, new Map());
    trackStore(this);
  }

  /**
   * Returns a **read-only** `Signal` for the given store slot.
   *
   * @param key - The slot name to read.
   * @returns A `Signal` wrapping the slot's current {@link ResourceState}.
   */
  get<K extends keyof TData>(key: K): Signal<TData[K]> {
    return this.signalsState.get(key.toString()) as unknown as Signal<TData[K]>;
  }

  /**
   * Registers a callback fired after every `update` or `clear` on the given slot.
   *
   * @param key - The slot to watch.
   * @param callback - Receives the new state and the previous state.
   * @returns A cleanup function that removes the listener when called.
   */
  onUpdate<K extends keyof TData>(
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
  update<K extends keyof TData>(key: K, newState: Partial<TData[K]>): void {
    const currentState = this.signalsState.get(key.toString());
    if (!currentState) {
      return;
    }

    const previousState = currentState() as TData[K];
    currentState.update((state) => ({
      ...state,
      ...newState,
    }));

    const updatedState = currentState() as TData[K];
    this.notifyUpdateHooks(key, updatedState, previousState);
  }

  /** Resets every slot in this store to its initial idle state. */
  clearAll(): void {
    Object.keys(this.storeEnum).forEach((key) => {
      this.clear(key as keyof TData);
    });
  }

  /**
   * Resets a single slot to `{ data: undefined, isLoading: false, status: undefined, errors: undefined }`.
   *
   * @param key - The slot to clear.
   */
  clear<K extends keyof TData>(key: K): void {
    const currentState = this.signalsState.get(key.toString());
    if (!currentState) {
      return;
    }

    const previousState = currentState() as TData[K];
    const _typedKey = key as keyof TEnum;
    currentState.set({
      data: undefined,
      isLoading: false,
      status: undefined,
      errors: undefined,
    } as TData[typeof _typedKey]);

    const nextState = currentState() as TData[K];
    this.notifyUpdateHooks(key, nextState, previousState);
  }

  /**
   * Marks a slot as loading: sets `isLoading: true` and clears `status` and `errors`.
   *
   * @param key - The slot to mark as loading.
   */
  startLoading<K extends keyof TData>(key: K): void {
    const currentState = this.signalsState.get(key.toString());
    if (!currentState) {
      return;
    }

    const _typedKey = key as keyof TEnum;
    currentState.update(
      (state) =>
        ({
          ...state,
          status: undefined,
          isLoading: true,
          errors: undefined,
        } as TData[typeof _typedKey])
    );
  }

  /**
   * Marks a slot as no longer loading: sets `isLoading: false`.
   * Does **not** clear `status` or `errors`.
   *
   * @param key - The slot to stop loading.
   */
  stopLoading<K extends keyof TData>(key: K): void {
    const currentState = this.signalsState.get(key.toString());
    if (!currentState) {
      return;
    }

    const _typedKey = key as keyof TEnum;
    currentState.update(
      (state) =>
        ({
          ...state,
          isLoading: false,
        } as TData[typeof _typedKey])
    );
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
  updateKeyedOne<K extends keyof TData>(
    key: K,
    resourceKey: KeyedResourceKey,
    entity: unknown
  ): void {
    const currentState = this.signalsState.get(key.toString());
    if (!currentState) {
      return;
    }

    const state = currentState();
    const data = isKeyedResourceData(state.data)
      ? state.data
      : createKeyedResourceData();

    const nextErrors = { ...data.errors };
    delete nextErrors[resourceKey];

    const nextData = {
      ...data,
      entities: {
        ...data.entities,
        [resourceKey]: entity,
      },
      isLoading: {
        ...data.isLoading,
        [resourceKey]: false,
      },
      status: {
        ...data.status,
        [resourceKey]: "Success" as const,
      },
      errors: nextErrors,
    };

    this.update(key, {
      data: nextData as unknown,
      isLoading: isAnyKeyLoading(nextData.isLoading),
      status: undefined,
      errors: undefined,
    } as Partial<TData[K]>);
  }

  /**
   * Removes a single entity from a {@link KeyedResourceData} slot,
   * including its loading flag, status, and errors.
   * Recalculates the top-level `isLoading` from the remaining keys.
   *
   * @param key - The keyed slot name.
   * @param resourceKey - The entity identifier to remove.
   */
  clearKeyedOne<K extends keyof TData>(
    key: K,
    resourceKey: KeyedResourceKey
  ): void {
    const currentState = this.signalsState.get(key.toString());
    if (!currentState) {
      return;
    }

    const previousState = currentState() as TData[K];
    const state = previousState as ResourceState<unknown>;
    if (!isKeyedResourceData(state.data)) {
      return;
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

    const _typedKey = key as keyof TEnum;
    currentState.update(
      (prev) =>
        ({
          ...prev,
          data: nextData as unknown,
          status: undefined,
          isLoading: isAnyKeyLoading(nextIsLoading),
          errors: undefined,
        } as TData[typeof _typedKey])
    );

    const updatedState = currentState() as TData[K];
    this.notifyUpdateHooks(key, updatedState, previousState);
  }

  /**
   * Marks a single entity within a keyed slot as loading.
   * Clears its status and errors. If the slot data is not yet a {@link KeyedResourceData},
   * falls back to `startLoading(key)`.
   *
   * @param key - The keyed slot name.
   * @param resourceKey - The entity identifier to mark as loading.
   */
  startKeyedLoading<K extends keyof TData>(
    key: K,
    resourceKey: KeyedResourceKey
  ): void {
    const currentState = this.signalsState.get(key.toString());
    if (!currentState) {
      return;
    }

    const _typedKey = key as keyof TEnum;
    const state = currentState();
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

    const nextStatus: typeof data.status = {
      ...data.status,
    };
    delete nextStatus[resourceKey];

    const nextErrors: typeof data.errors = {
      ...data.errors,
    };
    delete nextErrors[resourceKey];

    const nextData = {
      ...data,
      isLoading: nextIsLoading,
      status: nextStatus,
      errors: nextErrors,
    };

    currentState.update(
      (previous) =>
        ({
          ...previous,
          data: nextData,
          status: undefined,
          isLoading: isAnyKeyLoading(nextIsLoading),
          errors: undefined,
        } as TData[typeof _typedKey])
    );

    const updatedState = currentState() as TData[K];
    this.notifyUpdateHooks(key, updatedState, previousState);
  }

  private notifyUpdateHooks<K extends keyof TData>(
    key: K,
    nextState: TData[K],
    previousState: TData[K]
  ): void {
    const hooks = updateHooksMap.get(this);
    const keyHooks = hooks?.get(key);
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

  private initializeState(): void {
    Object.keys(this.storeEnum).forEach((key) => {
      const _typedKey = key as keyof TEnum;
      const initialState: ResourceState<unknown> = {
        data: undefined,
        isLoading: false,
        status: undefined,
        errors: undefined,
      };
      this.signalsState.set(
        _typedKey,
        signal<TData[typeof _typedKey]>(initialState as TData[typeof _typedKey])
      );
    });
  }
}
