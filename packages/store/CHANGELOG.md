# @flurryx/store

## 1.3.5

### Patch Changes

- mirrorKey now bidirectional by default with `direction` option to control behavior

## 1.3.3

### Patch Changes

- Fix `LazyStore.get()` throwing Angular NG0600 when invoked inside a
  `computed` or `effect`. The first call materialises the slot and used
  to update the internal `keysSignal`, which Angular flagged as a write
  inside the caller's reactive context. The bookkeeping write is now
  wrapped in `untracked` so it stays an internal side-effect.

## 1.3.2

### Patch Changes

- Publish pure `.for()` keyed read behavior, explicit keyed loading initialization, and aligned package dependency versions.
- Updated dependencies
  - @flurryx/core@1.3.2

## 1.3.0

### Minor Changes

- 9907541: Minor release with rename of time-travel APIs and new restoreResource method.

### Patch Changes

- f8e1a75: Fix published internal dependency versions so `1.1.x` packages resolve updated store and rx releases correctly.
- Updated dependencies [9907541]
  - @flurryx/core@1.2.0

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
