import { WritableSignal } from '@angular/core';
import { finalize, Observable, of, shareReplay, tap } from 'rxjs';
import type { ResourceState, StoreEnum, KeyedResourceKey } from '@flurryx/core';
import { isKeyedResourceData } from '@flurryx/core';
import { CACHE_NO_TIMEOUT, DEFAULT_CACHE_TTL_MS } from '@flurryx/core';

type StoreWithSignal<TKey extends StoreEnum> = {
  get: (key: TKey) => WritableSignal<ResourceState<unknown>> | undefined;
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

function setCacheEntry(
  store: object,
  key: StoreEnum,
  cacheKey: string,
  entry: CacheEntry
): void {
  getStoreKeyMap(store, key).set(cacheKey, entry);
}

function clearCacheEntry(
  store: object,
  key: StoreEnum,
  cacheKey: string
): void {
  getStoreKeyMap(store, key).delete(cacheKey);
}

function deriveResourceKey(args: unknown[]): KeyedResourceKey | undefined {
  const key = args[0];
  if (typeof key === 'string' || typeof key === 'number') {
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

interface StoreContext {
  store: object;
  storeSignal: WritableSignal<ResourceState<unknown>>;
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
  keyedData: ReturnType<typeof isKeyedResourceData> extends true
    ? { entities: object; isLoading: object; status: object; errors: object }
    : undefined;
  runtimeCacheKey: string;
  keyedCacheEntry: CacheEntry | undefined;
  nonKeyedCacheEntry: CacheEntry | undefined;
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
  const nonKeyedCacheKey = '__single__';
  const runtimeCacheKey = isKeyedCall ? keyedCacheKey : nonKeyedCacheKey;

  const keyedCacheEntry = getCacheEntry(store, storeKey, keyedCacheKey);
  const nonKeyedCacheEntry = getCacheEntry(store, storeKey, nonKeyedCacheKey);

  return {
    isKeyedCall,
    resourceKey,
    keyedData: keyedData as CacheContext['keyedData'],
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
  if (!context.keyedData && currentState.status === 'Error') {
    clearCacheEntry(store, storeKey, '__single__');
  }
  if (context.keyedData && context.resourceKey !== undefined) {
    const status = (
      context.keyedData as {
        status: Partial<Record<KeyedResourceKey, string>>;
      }
    ).status[context.resourceKey];
    if (status === 'Error') {
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
  const { keyedData, resourceKey, keyedCacheEntry, runtimeCacheKey } = context;

  if (!keyedData || resourceKey === undefined) {
    return { hit: false };
  }

  const typed = keyedData as {
    status: Partial<Record<KeyedResourceKey, string>>;
    entities: Partial<Record<KeyedResourceKey, unknown>>;
    isLoading: Partial<Record<KeyedResourceKey, boolean>>;
  };

  const status = typed.status[resourceKey];
  const entity = typed.entities[resourceKey];
  const loading = typed.isLoading[resourceKey] === true;

  const expired = isExpired(keyedCacheEntry?.timestamp, timeoutMs, now);
  if (expired) {
    clearCacheEntry(store, storeKey, runtimeCacheKey);
  }

  if (!expired && status === 'Success' && entity !== undefined) {
    if (returnObservable) {
      return { hit: true, value: of(entity) };
    }
    return { hit: true };
  }

  if (returnObservable) {
    if (keyedCacheEntry?.inflight$) {
      return { hit: true, value: keyedCacheEntry.inflight$ };
    }
  } else if (loading) {
    return { hit: true };
  }

  return { hit: false };
}

function handleNonKeyedCache(
  store: object,
  storeKey: StoreEnum,
  context: CacheContext,
  timeoutMs: number,
  now: number,
  returnObservable: boolean,
  currentState: ResourceState<unknown>,
  argsString: string,
  storeSignal: WritableSignal<ResourceState<unknown>>
): CacheHitResult {
  const { nonKeyedCacheEntry, runtimeCacheKey } = context;

  if (
    returnObservable &&
    nonKeyedCacheEntry?.args === argsString &&
    nonKeyedCacheEntry.inflight$
  ) {
    return { hit: true, value: nonKeyedCacheEntry.inflight$ };
  }

  const hasValidCacheState =
    currentState?.status === 'Success' || currentState?.isLoading === true;

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

export function SkipIfCached<TKey extends StoreEnum>(
  storeKey: TKey,
  storeGetter: (instance: {
    store: StoreWithSignal<TKey>;
  }) => StoreWithSignal<TKey> | undefined,
  returnObservable?: boolean,
  timeoutMs?: number
): MethodDecorator;
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
          currentState,
          argsString,
          storeSignal
        );
      }

      if (cacheHit.hit) {
        return cacheHit.value;
      }

      const result = originalMethod.apply(this, args);

      if (!returnObservable) {
        setCacheEntry(store, storeKey, cacheContext.runtimeCacheKey, {
          timestamp: now,
          args: argsString,
        });
        return result;
      }

      const inflight$ = createCachedObservable(
        result as Observable<unknown>,
        store,
        storeKey,
        cacheContext.runtimeCacheKey,
        argsString
      );

      setCacheEntry(store, storeKey, cacheContext.runtimeCacheKey, {
        timestamp: now,
        args: argsString,
        inflight$,
      });

      return inflight$;
    };

    return descriptor;
  };
}
