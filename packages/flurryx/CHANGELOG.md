# flurryx

## 1.3.5

### Patch Changes

- mirrorKey now bidirectional by default with `direction` option to control behavior
- Updated dependencies
  - @flurryx/store@1.3.5
  - @flurryx/rx@1.3.5

## 1.3.3

### Patch Changes

- Updated dependencies
  - @flurryx/store@1.3.3
  - @flurryx/rx@1.3.3

## 1.3.2

### Patch Changes

- Publish pure `.for()` keyed read behavior, explicit keyed loading initialization, and aligned package dependency versions.
- Updated dependencies
  - @flurryx/core@1.3.2
  - @flurryx/store@1.3.2
  - @flurryx/rx@1.3.2

## 1.3.0

### Minor Changes

- 9907541: Minor release with rename of time-travel APIs and new restoreResource method.

### Patch Changes

- f8e1a75: Fix published internal dependency versions so `1.1.x` packages resolve updated store and rx releases correctly.
- Updated dependencies [f8e1a75]
- Updated dependencies [9907541]
  - @flurryx/store@1.3.0
  - @flurryx/rx@1.3.0
  - @flurryx/core@1.2.0

## 1.0.1

### Patch Changes

- Updated dependencies
  - @flurryx/store@1.0.1
  - @flurryx/core@1.0.1
  - @flurryx/rx@1.0.1

## 0.8.3

### Patch Changes

- Updated dependencies
  - @flurryx/store@0.8.3
  - @flurryx/rx@0.8.3

## 0.8.2

### Patch Changes

- Updated dependencies
  - @flurryx/store@0.8.2
  - @flurryx/rx@0.8.2

## 0.8.1

### Patch Changes

- fd8bd49: Add a global `clearAllStores()` helper to reset all tracked store instances for logout and tenant-switch flows.
- Updated dependencies [fd8bd49]
  - @flurryx/store@0.8.1
  - @flurryx/rx@0.8.1

## 1.0.0

### Major Changes

- 47fd120: First stable release of flurryx: Angular Signals store + RxJS interoperability.

### Patch Changes

- Updated dependencies [47fd120]
  - @flurryx/store@1.0.0
  - @flurryx/core@1.0.0
  - @flurryx/rx@1.0.0
