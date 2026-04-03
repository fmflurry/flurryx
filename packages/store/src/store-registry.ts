interface Clearable {
  clearAll(): void;
}

const trackedStores = new Set<Clearable>();

export function trackStore(store: Clearable): void {
  trackedStores.add(store);
}

/**
 * Clears every store instance tracked by flurryx.
 *
 * Calls `clearAll()` on each registered store, resetting all slots to their
 * initial idle state. Useful for logout, tenant switching, or test cleanup.
 *
 * @example
 * ```ts
 * import { clearAllStores } from 'flurryx';
 *
 * logout() {
 *   clearAllStores();
 * }
 * ```
 */
export function clearAllStores(): void {
  for (const store of [...trackedStores]) {
    store.clearAll();
  }
}

export function resetTrackedStoresForTests(): void {
  trackedStores.clear();
}
