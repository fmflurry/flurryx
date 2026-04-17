import { computed, type Signal } from "@angular/core";
import { isKeyedResourceData, type KeyedResourceKey } from "@flurryx/core";
import { createDefaultState } from "./store-message-consumer";
import type {
  KeyedResourceEntryKey,
  KeyedResourceState,
  KeyedStoreKey,
  StoreDataShape,
  StoreKey,
  StoreSignal,
  ValueOrSignal,
} from "./types";

function resolveValue<T>(valueOrSignal: ValueOrSignal<T>): T {
  return typeof valueOrSignal === "function"
    ? (valueOrSignal as Signal<T>)()
    : valueOrSignal;
}

function isKeyedResourceKeyValue(value: unknown): value is KeyedResourceKey {
  return typeof value === "string" || typeof value === "number";
}

export function createStoreSignalView<
  TData extends StoreDataShape<TData>,
  K extends StoreKey<TData>,
>(
  slotSignal: Signal<TData[K]>
): StoreSignal<TData, K> {
  const keyedSignalCache = new Map<unknown, Signal<unknown>>();

  const storeSignal = slotSignal as StoreSignal<TData, K>;
  const signalWithKeyedAccess = storeSignal as StoreSignal<TData, K> & {
    for: (
      resourceKey: ValueOrSignal<KeyedResourceEntryKey<TData, KeyedStoreKey<TData>>>
    ) => Signal<unknown>;
  };

  signalWithKeyedAccess.for = (
    resourceKeyInput: ValueOrSignal<
      KeyedResourceEntryKey<TData, KeyedStoreKey<TData>>
    >
  ): Signal<unknown> => {
    const cachedSignal = keyedSignalCache.get(resourceKeyInput);
    if (cachedSignal) {
      return cachedSignal;
    }

    const keyedSignal = computed(() => {
      const resourceKey = resolveValue(resourceKeyInput);
      if (!isKeyedResourceKeyValue(resourceKey)) {
        return createDefaultState();
      }

      const currentData = slotSignal().data;
      const currentEntry = isKeyedResourceData(currentData)
        ? currentData[resourceKey]
        : undefined;

      return (currentEntry ??
        createDefaultState()) as KeyedResourceState<
        TData,
        KeyedStoreKey<TData>
      >;
    }) as Signal<
      KeyedResourceState<TData, KeyedStoreKey<TData>>
    >;

    keyedSignalCache.set(resourceKeyInput, keyedSignal as Signal<unknown>);
    return keyedSignal;
  };

  return storeSignal;
}
