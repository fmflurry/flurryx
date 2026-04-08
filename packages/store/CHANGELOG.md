# @flurryx/store

## 1.0.1

### Patch Changes

- e23886f: Expose reactive `history`, `messages`, `currentIndex`, and `keys` signals on the public store contract so UI tooling can observe store activity directly.
- 6e62603: Fix public signal-store typings so the shared store contract remains type-safe when consuming the new reactive metadata signals.
- f6a3c8d: Refactor constructor field assignments to simplify the typed history-driver wiring introduced in the `1.0.x` line.

## 0.8.3

### Patch Changes

- fix(store): stopLoading no longer clears errors and status

## 0.8.2

### Patch Changes

- refactor(store): remove unnecessary type assertions in lazy-store
  refactor(rx): extract NonKeyedCacheExtra interface in skip-if-cached
  refactor(store): formatting cleanup in store-builder

## 0.8.1

### Patch Changes

- fd8bd49: Add a global `clearAllStores()` helper to reset all tracked store instances for logout and tenant-switch flows.

## 1.0.0

### Major Changes

- 47fd120: First stable release of flurryx: Angular Signals store + RxJS interoperability.

### Patch Changes

- Updated dependencies [47fd120]
  - @flurryx/core@1.0.0
