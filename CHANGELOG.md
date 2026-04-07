# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-04-07

First stable release. The public API is now considered stable and follows semver going forward.

### Added

- **Message queueing and history** — every store mutation is now a typed, immutable message published to an internal broker channel. Messages are tracked
  with stable numeric ids, delivery status, and attempt counts.
- **History and time travel** — full store snapshots are captured after each acknowledged message. Navigate with `travelTo(index)`, `undo()`, `redo()`, and
  `getCurrentIndex()`.
- **Message replay** — re-execute previously published messages by id with `replay(id)` or `replay(ids)`. Creates new acknowledged history entries.
- **Dead-letter recovery** — failed messages are moved to a dead-letter queue instead of crashing the store. Inspect with `getDeadLetters()`, retry with
  `replayDeadLetter(id)` or `replayDeadLetters()`.
- **Pluggable message channels** — `createInMemoryStoreMessageChannel` (default), `createLocalStorageStoreMessageChannel`,
  `createSessionStorageStoreMessageChannel`, `createCompositeStoreMessageChannel`, and `createStorageStoreMessageChannel` for custom adapters.
- **Built-in serialization** — storage-backed channels automatically round-trip `Date`, `Map`, `Set`, `undefined`, and nested objects. Custom
  `serialize`/`deserialize` hooks supported.
- **`cloneValue` utility** — exported deep-clone function handling `Date`, `Map`, `Set`, circular references, and prototype chains.
- **`getMessages()` / `getMessages(key)`** — inspect the full message log or filter by store key.
- **`getHistory()` / `getHistory(key)`** — inspect snapshot history, optionally filtered to a single key.

### Changed

- **onUpdate hook error isolation** — a throwing `onUpdate` hook no longer prevents other hooks from firing or routes the message to the dead-letter queue.
  All hooks execute; errors are deferred via `queueMicrotask` and surface as uncaught exceptions without breaking the store.
- **localStorage quota handling** — storage-backed channels now gracefully handle `QuotaExceededError` by evicting the oldest messages until the write
  succeeds, instead of silently failing.

## [0.8.4] — 2026-03-28

### Added

- JSDoc comments on all public APIs.
- Taskflurry sample app showcasing full flurryx usage with Clean Architecture.

### Fixed

- `stopLoading` no longer clears `errors` and `status` — only sets `isLoading: false`.

### Changed

- Sample app uses `Store.for<Config>()` interface-based syntax.
- Sample app enables zoneless change detection (no zone.js).

## [0.8.0] — 2026-03-20

### Added

- `clearAllStores()` global helper for app-wide cache resets (logout, tenant switching).
- `mirrorSelf(sourceKey, targetKey)` builder method for intra-store synchronization.

### Changed

- Improved store type safety across the builder API.

## [0.7.6] — 2026-03-18

### Changed

- `store.get(key)` now returns a **read-only `Signal`** instead of `WritableSignal`, enforcing strict encapsulation.

## [0.7.5] — 2026-03-17

### Added

- `clearKeyedOne(key, resourceKey)` for per-entity cache invalidation in keyed slots.
- Clearing store data documentation in root and store READMEs.

## [0.7.3] — 2026-03-15

### Added

- Keyed operations on `IStore` and `LazyStore`: `updateKeyedOne`, `clearKeyedOne`, `startKeyedLoading`.
- `.mirrorKeyed()` builder method for accumulating single-entity fetches into `KeyedResourceData` caches.

## [0.7.1] — 2026-03-13

### Added

- `mirrorKey(source, sourceKey, target, targetKey?, options?)` utility for cross-store synchronization.
- `collectKeyed(source, sourceKey, target, targetKey?, options?)` utility for building keyed caches from single-entity sources.
- `.mirror()` builder method for declarative store mirroring.

## [0.7.0] — 2026-03-12

### Changed

- `syncToStore` and `syncToKeyedStore` now accept the `IStore` interface instead of concrete store classes.

## [0.6.2] — 2026-03-10

### Added

- `Store.for<Config>().build()` interface-based builder — the recommended store creation pattern. Type-safe with zero boilerplate.

## [0.6.0] — 2026-03-08

### Added

- `Store` fluent builder API (`Store.resource('KEY').as<T>().build()`).
- Enum-constrained builder (`Store.for(enum).resource(...).build()`).

## [0.5.0] — 2026-03-05

### Added

- Initial release of the flurryx signal-first reactive state toolkit.
- `@flurryx/core` — shared types, `ResourceState`, `KeyedResourceData`, cache constants.
- `@flurryx/store` — `BaseStore` with Angular signals, `onUpdate` hooks, loading/error lifecycle.
- `@flurryx/rx` — `syncToStore`, `syncToKeyedStore`, `@SkipIfCached`, `@Loading`, error normalization.
- `flurryx` umbrella package re-exporting all three packages.
