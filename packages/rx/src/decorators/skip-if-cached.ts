import type { Signal } from "@angular/core";
import { finalize, Observable, of, shareReplay, tap } from "rxjs";
import {
  isKeyedResourceData,
  CACHE_NO_TIMEOUT,
  DEFAULT_CACHE_TTL_MS,
} from "@flurryx/core";
import type {
  KeyedResourceData,
  ResourceState,
  StoreEnum,
  KeyedResourceKey,
} from "@flurryx/core";

type StoreWithSignal<TKey extends StoreEnum> = {
  get: (key: TKey) => Signal<ResourceState<unknown>> | undefined;
  onUpdate?: (
    key: TKey,
    callback: (
      state: ResourceState<unknown>,
      previousState: ResourceState<unknown>
    ) => void
  ) => () => void;
  onCacheInvalidate?: (
    key: TKey,
    callback: (event: { key: TKey; resourceKey?: KeyedResourceKey }) => void
  ) => () => void;
};

interface CacheEntry {
  timestamp: number;
  args: string;
  inflight$?: Observable<unknown>;
}

const cacheState = new WeakMap<
  object,
  Map<StoreEnum, Map<string, CacheEntry>>
>();

const keyedCacheIndex = new WeakMap<
  object,
  Map<StoreEnum, Map<string, Set<string>>>
>();

const cacheKeyOwners = new WeakMap<
  object,
  Map<StoreEnum, Map<string, string>>
>();

const storeSyncRegistry = new WeakMap<object, Set<StoreEnum>>();

function getStoreKeyMap(
  store: object,
  key: StoreEnum
): Map<string, CacheEntry> {
  let storeMap = cacheState.get(store);
  if (!storeMap) {
    storeMap = new Map();
    cacheState.set(store, storeMap);
  }

  let keyMap = storeMap.get(key);
  if (!keyMap) {
    keyMap = new Map();
    storeMap.set(key, keyMap);
  }

  return keyMap;
}

function getCacheEntry(
  store: object,
  key: StoreEnum,
  cacheKey: string
): CacheEntry | undefined {
  return getStoreKeyMap(store, key).get(cacheKey);
}

function getKeyedCacheIndexMap(
  store: object,
  key: StoreEnum
): Map<string, Set<string>> {
  let storeMap = keyedCacheIndex.get(store);
  if (!storeMap) {
    storeMap = new Map();
    keyedCacheIndex.set(store, storeMap);
  }

  let keyMap = storeMap.get(key);
  if (!keyMap) {
    keyMap = new Map();
    storeMap.set(key, keyMap);
  }

  return keyMap;
}

function getCacheKeyOwnersMap(
  store: object,
  key: StoreEnum
): Map<string, string> {
  let storeMap = cacheKeyOwners.get(store);
  if (!storeMap) {
    storeMap = new Map();
    cacheKeyOwners.set(store, storeMap);
  }

  let keyMap = storeMap.get(key);
  if (!keyMap) {
    keyMap = new Map();
    storeMap.set(key, keyMap);
  }

  return keyMap;
}

function toResourceIndexKey(resourceKey: KeyedResourceKey): string {
  return String(resourceKey);
}

function trackKeyedCacheEntry(
  store: object,
  key: StoreEnum,
  resourceKey: KeyedResourceKey,
  cacheKey: string
): void {
  const resourceIndexKey = toResourceIndexKey(resourceKey);
  const keyedIndexMap = getKeyedCacheIndexMap(store, key);
  const existingKeys = keyedIndexMap.get(resourceIndexKey) ?? new Set<string>();
  existingKeys.add(cacheKey);
  keyedIndexMap.set(resourceIndexKey, existingKeys);
  getCacheKeyOwnersMap(store, key).set(cacheKey, resourceIndexKey);
}

function untrackKeyedCacheEntry(
  store: object,
  key: StoreEnum,
  cacheKey: string
): void {
  const ownersMap = getCacheKeyOwnersMap(store, key);
  const resourceIndexKey = ownersMap.get(cacheKey);
  if (!resourceIndexKey) {
    return;
  }

  ownersMap.delete(cacheKey);
  const keyedIndexMap = getKeyedCacheIndexMap(store, key);
  const existingKeys = keyedIndexMap.get(resourceIndexKey);
  if (!existingKeys) {
    return;
  }

  existingKeys.delete(cacheKey);
  if (existingKeys.size === 0) {
    keyedIndexMap.delete(resourceIndexKey);
  }
}

function setCacheEntry(
  store: object,
  key: StoreEnum,
  cacheKey: string,
  entry: CacheEntry,
  resourceKey?: KeyedResourceKey
): void {
  getStoreKeyMap(store, key).set(cacheKey, entry);
  if (resourceKey !== undefined) {
    trackKeyedCacheEntry(store, key, resourceKey, cacheKey);
  }
}

function clearCacheEntry(
  store: object,
  key: StoreEnum,
  cacheKey: string
): void {
  getStoreKeyMap(store, key).delete(cacheKey);
  untrackKeyedCacheEntry(store, key, cacheKey);
}

function clearAllCacheEntries(store: object, key: StoreEnum): void {
  cacheState.get(store)?.delete(key);
  keyedCacheIndex.get(store)?.delete(key);
  cacheKeyOwners.get(store)?.delete(key);
}

function clearKeyedCacheEntries(
  store: object,
  key: StoreEnum,
  resourceKey: KeyedResourceKey
): void {
  const resourceIndexKey = toResourceIndexKey(resourceKey);
  const keyedIndexMap = getKeyedCacheIndexMap(store, key);
  const cacheKeys = keyedIndexMap.get(resourceIndexKey);
  if (!cacheKeys) {
    return;
  }

  cacheKeys.forEach((cacheKey) => {
    getStoreKeyMap(store, key).delete(cacheKey);
    getCacheKeyOwnersMap(store, key).delete(cacheKey);
  });
  keyedIndexMap.delete(resourceIndexKey);
}

function deriveResourceKey(args: unknown[]): KeyedResourceKey | undefined {
  const key = args[0];
  if (typeof key === "string" || typeof key === "number") {
    return key;
  }
  return undefined;
}

function isExpired(
  timestamp: number | undefined,
  timeoutMs: number,
  now: number
): boolean {
  if (timeoutMs === CACHE_NO_TIMEOUT) {
    return false;
  }
  if (timestamp === undefined) {
    return false;
  }
  return now - timestamp >= timeoutMs;
}

function getSeedCacheKeys(resourceKey: string): string[] {
  const seedKeys = [JSON.stringify([resourceKey])];
  const numericResourceKey = Number(resourceKey);

  if (
    Number.isFinite(numericResourceKey) &&
    String(numericResourceKey) === resourceKey
  ) {
    seedKeys.push(JSON.stringify([numericResourceKey]));
  }

  return seedKeys;
}

function syncKeyedCacheFromState(
  store: object,
  storeKey: StoreEnum,
  currentState: ResourceState<unknown>,
  previousState?: ResourceState<unknown>
): void {
  const currentKeyed = isKeyedResourceData(currentState.data)
    ? currentState.data
    : undefined;
  const previousKeyed =
    previousState && isKeyedResourceData(previousState.data)
      ? previousState.data
      : undefined;

  if (!currentKeyed && !previousKeyed) {
    return;
  }

  const currentRecord = currentKeyed
    ? toKeyedResourceRecord(currentKeyed)
    : undefined;
  const previousRecord = previousKeyed
    ? toKeyedResourceRecord(previousKeyed)
    : undefined;
  const resourceKeys = new Set<string>([
    ...Object.keys(previousRecord ?? {}),
    ...Object.keys(currentRecord ?? {}),
  ]);
  const now = Date.now();

  resourceKeys.forEach((resourceKey) => {
    const nextEntry = currentRecord?.[resourceKey];

    if (!nextEntry || nextEntry.status === "Error") {
      clearKeyedCacheEntries(store, storeKey, resourceKey);
      return;
    }

    const shouldSeed =
      (nextEntry.status === "Success" && nextEntry.data !== undefined) ||
      nextEntry.isLoading === true;

    if (!shouldSeed) {
      return;
    }

    getSeedCacheKeys(resourceKey).forEach((cacheKey) => {
      setCacheEntry(
        store,
        storeKey,
        cacheKey,
        {
          timestamp: now,
          args: cacheKey,
        },
        resourceKey
      );
    });
  });
}

function ensureStoreCacheSync<TKey extends StoreEnum>(
  store: StoreWithSignal<TKey>,
  storeKey: TKey,
  currentState: ResourceState<unknown>
): void {
  const syncedKeys = storeSyncRegistry.get(store as object) ?? new Set<StoreEnum>();
  if (syncedKeys.has(storeKey)) {
    return;
  }

  syncedKeys.add(storeKey);
  storeSyncRegistry.set(store as object, syncedKeys);

  store.onUpdate?.(storeKey, (state, previousState) => {
    syncKeyedCacheFromState(store as object, storeKey, state, previousState);
  });

  store.onCacheInvalidate?.(storeKey, (event) => {
    if (event.resourceKey === undefined) {
      clearAllCacheEntries(store as object, storeKey);
      return;
    }

    clearKeyedCacheEntries(store as object, storeKey, event.resourceKey);
  });

  syncKeyedCacheFromState(store as object, storeKey, currentState);
}

interface StoreContext {
  store: object;
  storeSignal: Signal<ResourceState<unknown>>;
  currentState: ResourceState<unknown>;
}

function getStoreContext<TTarget, TKey extends StoreEnum>(
  instance: TTarget,
  storeKey: TKey,
  getStore: (i: TTarget) => StoreWithSignal<TKey> | undefined
): StoreContext | undefined {
  const store = getStore(instance);
  if (!store) {
    return undefined;
  }

  const storeSignal = store.get(storeKey);
  if (!storeSignal) {
    return undefined;
  }

  const currentState = storeSignal();
  if (currentState === null || currentState === undefined) {
    return undefined;
  }

  return { store, storeSignal, currentState };
}

interface CacheContext {
  isKeyedCall: boolean;
  resourceKey: KeyedResourceKey | undefined;
  keyedData: KeyedResourceData<KeyedResourceKey, unknown> | undefined;
  runtimeCacheKey: string;
  keyedCacheEntry: CacheEntry | undefined;
  nonKeyedCacheEntry: CacheEntry | undefined;
}

type KeyedResourceRecord = Partial<
  Record<KeyedResourceKey, ResourceState<unknown>>
>;

function toKeyedResourceRecord(
  data: KeyedResourceData<KeyedResourceKey, unknown>
): KeyedResourceRecord {
  return data as unknown as KeyedResourceRecord;
}

function getCacheContext(
  store: object,
  storeKey: StoreEnum,
  args: unknown[],
  argsString: string,
  currentState: ResourceState<unknown>
): CacheContext {
  const keyedData = isKeyedResourceData(currentState.data)
    ? currentState.data
    : undefined;
  const resourceKey = keyedData ? deriveResourceKey(args) : undefined;
  const isKeyedCall = keyedData !== undefined && resourceKey !== undefined;

  const keyedCacheKey = argsString;
  const nonKeyedCacheKey = "__single__";
  const runtimeCacheKey = isKeyedCall ? keyedCacheKey : nonKeyedCacheKey;

  const keyedCacheEntry = getCacheEntry(store, storeKey, keyedCacheKey);
  const nonKeyedCacheEntry = getCacheEntry(store, storeKey, nonKeyedCacheKey);

  return {
    isKeyedCall,
    resourceKey,
    keyedData,
    runtimeCacheKey,
    keyedCacheEntry,
    nonKeyedCacheEntry,
  };
}

function handleCacheErrors(
  store: object,
  storeKey: StoreEnum,
  context: CacheContext,
  currentState: ResourceState<unknown>
): void {
  if (!context.keyedData && currentState.status === "Error") {
    clearCacheEntry(store, storeKey, "__single__");
  }
  if (context.keyedData && context.resourceKey !== undefined) {
    const keyedData = toKeyedResourceRecord(context.keyedData);
    const status = keyedData[context.resourceKey]?.status;
    if (status === "Error") {
      clearCacheEntry(store, storeKey, context.runtimeCacheKey);
    }
  }
}

interface CacheHitResult {
  hit: boolean;
  value?: Observable<unknown>;
}

function handleKeyedCache(
  store: object,
  storeKey: StoreEnum,
  context: CacheContext,
  timeoutMs: number,
  now: number,
  returnObservable: boolean
): CacheHitResult {
  const {
    keyedData,
    resourceKey,
    keyedCacheEntry,
    runtimeCacheKey,
  } = context;

  if (!keyedData || resourceKey === undefined) {
    return { hit: false };
  }

  const resourceState = toKeyedResourceRecord(keyedData)[resourceKey];
  const status = resourceState?.status;
  const entity = resourceState?.data;
  const loading = resourceState?.isLoading === true;

  const expired = isExpired(keyedCacheEntry?.timestamp, timeoutMs, now);
  if (expired) {
    clearCacheEntry(store, storeKey, runtimeCacheKey);
  }

  const hasValidCacheEntry =
    keyedCacheEntry !== undefined &&
    keyedCacheEntry.args === runtimeCacheKey &&
    !expired;

  if (hasValidCacheEntry && status === "Success" && entity !== undefined) {
    if (returnObservable) {
      return { hit: true, value: of(entity) };
    }
    return { hit: true };
  }

  if (returnObservable) {
    if (hasValidCacheEntry && keyedCacheEntry.inflight$) {
      return { hit: true, value: keyedCacheEntry.inflight$ };
    }
  } else if (hasValidCacheEntry && loading) {
    return { hit: true };
  }

  return { hit: false };
}

interface NonKeyedCacheExtra {
  readonly currentState: ResourceState<unknown>;
  readonly argsString: string;
  readonly storeSignal: Signal<ResourceState<unknown>>;
}

function handleNonKeyedCache(
  store: object,
  storeKey: StoreEnum,
  context: CacheContext,
  timeoutMs: number,
  now: number,
  returnObservable: boolean,
  extra: NonKeyedCacheExtra
): CacheHitResult {
  const { nonKeyedCacheEntry, runtimeCacheKey } = context;
  const { currentState, argsString, storeSignal } = extra;

  if (
    returnObservable &&
    nonKeyedCacheEntry?.args === argsString &&
    nonKeyedCacheEntry.inflight$
  ) {
    return { hit: true, value: nonKeyedCacheEntry.inflight$ };
  }

  const hasValidCacheState =
    currentState?.status === "Success" || currentState?.isLoading === true;

  if (
    nonKeyedCacheEntry &&
    isExpired(nonKeyedCacheEntry.timestamp, timeoutMs, now)
  ) {
    clearCacheEntry(store, storeKey, runtimeCacheKey);
  } else if (nonKeyedCacheEntry?.args === argsString && hasValidCacheState) {
    if (returnObservable) {
      if (nonKeyedCacheEntry.inflight$) {
        return { hit: true, value: nonKeyedCacheEntry.inflight$ };
      }
      return { hit: true, value: of(storeSignal().data) };
    }
    return { hit: true };
  }

  return { hit: false };
}

function createCachedObservable(
  result: Observable<unknown>,
  store: object,
  storeKey: StoreEnum,
  runtimeCacheKey: string,
  argsString: string
): Observable<unknown> {
  return result.pipe(
    tap({
      next: () => {
        setCacheEntry(store, storeKey, runtimeCacheKey, {
          timestamp: Date.now(),
          args: argsString,
        });
      },
      error: () => {
        clearCacheEntry(store, storeKey, runtimeCacheKey);
      },
    }),
    finalize(() => {
      const entry = getCacheEntry(store, storeKey, runtimeCacheKey);
      if (entry?.inflight$) {
        const { inflight$: _inflight$, ...rest } = entry;
        setCacheEntry(store, storeKey, runtimeCacheKey, rest);
      }
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );
}

/**
 * Method decorator that skips execution when the store already has valid cached data.
 *
 * **Cache hit** (method skipped) when:
 * - `status === 'Success'` or `isLoading === true`
 * - Timeout has not expired
 * - Method arguments match (compared via `JSON.stringify`)
 *
 * **Cache miss** (method executes) when:
 * - Initial state (no status, not loading)
 * - `status === 'Error'` (errors are never cached)
 * - Timeout expired
 * - Arguments changed
 *
 * **Keyed resources**: When the first argument is a `string | number` and the store
 * data is a `KeyedResourceData`, cache entries are tracked per resource key automatically.
 *
 * @param storeKey - The store slot to check for cached data.
 * @param storeGetter - Function to retrieve the store from the decorated class instance.
 * @param returnObservable - When `true`, returns `Observable` (with `shareReplay` for deduplication).
 *   When `false`, returns `void`.
 *   @default false
 * @param timeoutMs - Cache TTL in milliseconds. Use `CACHE_NO_TIMEOUT` for infinite.
 *   @default DEFAULT_CACHE_TTL_MS (300 000 ms / 5 minutes)
 *
 * @example
 * ```ts
 * @SkipIfCached('LIST', (i: ProductFacade) => i.store)
 * @Loading('LIST', (i: ProductFacade) => i.store)
 * loadProducts() {
 *   this.http.get('/api/products')
 *     .pipe(syncToStore(this.store, 'LIST'))
 *     .subscribe();
 * }
 * ```
 */
export function SkipIfCached<TKey extends StoreEnum>(
  storeKey: TKey,
  storeGetter: (instance: {
    store: StoreWithSignal<TKey>;
  }) => StoreWithSignal<TKey> | undefined,
  returnObservable?: boolean,
  timeoutMs?: number
): MethodDecorator;
/** @inheritDoc */
export function SkipIfCached<TTarget, TKey extends StoreEnum>(
  storeKey: TKey,
  storeGetter: (instance: TTarget) => StoreWithSignal<TKey> | undefined,
  returnObservable?: boolean,
  timeoutMs?: number
): MethodDecorator;
export function SkipIfCached<TTarget, TKey extends StoreEnum>(
  storeKey: TKey,
  storeGetter: (instance: TTarget) => StoreWithSignal<TKey> | undefined,
  returnObservable = false,
  timeoutMs = DEFAULT_CACHE_TTL_MS
): MethodDecorator {
  return function (
    _target: unknown,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value as (
      this: TTarget,
      ...args: unknown[]
    ) => unknown;

    descriptor.value = function (this: TTarget, ...args: unknown[]) {
      const storeContext = getStoreContext(this, storeKey, storeGetter);
      if (!storeContext) {
        return originalMethod.apply(this, args);
      }
      const { store, storeSignal, currentState } = storeContext;
      ensureStoreCacheSync(store as StoreWithSignal<TKey>, storeKey, currentState);

      const argsString = JSON.stringify(args);
      const now = Date.now();
      const cacheContext = getCacheContext(
        store,
        storeKey,
        args,
        argsString,
        currentState
      );

      handleCacheErrors(store, storeKey, cacheContext, currentState);

      let cacheHit: CacheHitResult;

      if (cacheContext.isKeyedCall) {
        cacheHit = handleKeyedCache(
          store,
          storeKey,
          cacheContext,
          timeoutMs,
          now,
          returnObservable
        );
      } else {
        cacheHit = handleNonKeyedCache(
          store,
          storeKey,
          cacheContext,
          timeoutMs,
          now,
          returnObservable,
          { currentState, argsString, storeSignal }
        );
      }

      if (cacheHit.hit) {
        return cacheHit.value;
      }

      const result = originalMethod.apply(this, args);

      if (!returnObservable) {
        setCacheEntry(
          store,
          storeKey,
          cacheContext.runtimeCacheKey,
          {
            timestamp: now,
            args: argsString,
          },
          cacheContext.resourceKey
        );
        return result;
      }

      const inflight$ = createCachedObservable(
        result as Observable<unknown>,
        store,
        storeKey,
        cacheContext.runtimeCacheKey,
        argsString
      );

      setCacheEntry(
        store,
        storeKey,
        cacheContext.runtimeCacheKey,
        {
          timestamp: now,
          args: argsString,
          inflight$,
        },
        cacheContext.resourceKey
      );

      return inflight$;
    };

    return descriptor;
  };
}
