interface Clearable {
  clearAll(): void;
}

const trackedStores = new Set<Clearable>();

export function trackStore(store: Clearable): void {
  trackedStores.add(store);
}

export function clearAllStores(): void {
  for (const store of [...trackedStores]) {
    store.clearAll();
  }
}

export function resetTrackedStoresForTests(): void {
  trackedStores.clear();
}
