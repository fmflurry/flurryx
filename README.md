<p align="center">
  <img src="assets/picto.svg" alt="" width="64" />
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="assets/logo.svg" />
    <img src="assets/logo.svg" alt="flurryx" width="480" />
  </picture>
</p>

<p align="center">
  <img src="https://img.shields.io/npm/v/flurryx?color=dd0031" alt="flurryx version" />
  <img src="https://img.shields.io/badge/Angular-%3E%3D17-dd0031" alt="Angular >=17" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" />
</p>

**Signal-first reactive state management for Angular.**

flurryx bridges the gap between RxJS async operations and Angular signals. Define a store, pipe your HTTP calls through an operator, read signals in your templates. No actions, no reducers, no effects boilerplate.

```typescript
// Store — declare your slots with a single interface
interface ProductStoreConfig {
  LIST: Product[];
  DETAIL: Product;
}
export const ProductStore = Store.for<ProductStoreConfig>().build();

// Facade
@SkipIfCached('LIST', (i) => i.store)
@Loading('LIST', (i) => i.store)
loadProducts() {
  this.http.get<Product[]>('/api/products')
    .pipe(syncToStore(this.store, 'LIST'))
    .subscribe();
}

// Component template — just read the signal
@if (facade.list().isLoading) { <spinner /> }
@for (product of facade.list().data; track product.id) {
  <product-card [product]="product" />
}
```

No `async` pipe. No `subscribe` in templates. No manual unsubscription.

---

## Table of Contents

- [Why flurryx?](#why-flurryx)
- [Packages](#packages)
- [How to Install](#how-to-install)
- [Getting Started](#getting-started)
- [How to Use](#how-to-use)
  - [ResourceState](#resourcestate)
  - [Store API](#store-api)
  - [Store Creation Styles](#store-creation-styles)
  - [syncToStore](#synctostore)
  - [syncToKeyedStore](#synctokeyedstore)
  - [@SkipIfCached](#skipifcached)
  - [@Loading](#loading)
  - [Error Normalization](#error-normalization)
  - [Constants](#constants)
- [Keyed Resources](#keyed-resources)
- [Design Decisions](#design-decisions)
- [Contributing](#contributing)
- [License](#license)

---

## Why flurryx?

Angular signals are great for synchronous reactivity, but real applications still need RxJS for HTTP calls, WebSockets, and other async sources. The space between "I fired a request" and "my template shows the result" is where complexity piles up:

| Problem            | Without flurryx                                    | With flurryx                                   |
| ------------------ | -------------------------------------------------- | ---------------------------------------------- |
| Loading spinners   | Manual boolean flags, race conditions              | `store.get(key)().isLoading`                   |
| Error handling     | Scattered `catchError` blocks, inconsistent shapes | Normalized `{ code, message }[]` on every slot |
| Caching            | Custom `shareReplay` / `BehaviorSubject` wiring    | `@SkipIfCached` decorator, one line            |
| Duplicate requests | Manual `distinctUntilChanged`, inflight tracking   | `@SkipIfCached` deduplicates while loading     |
| Keyed resources    | Separate state per ID, boilerplate explosion       | `KeyedResourceData` with per-key loading/error |

flurryx gives you **one fluent builder**, **two RxJS operators**, and **two decorators**. That's the entire API.

---

## How to Install

```bash
npm install flurryx
```

That's it. The `flurryx` package re-exports everything from the three internal packages (`@flurryx/core`, `@flurryx/store`, `@flurryx/rx`), so every import comes from a single place:

```typescript
import { Store, syncToStore, SkipIfCached, Loading } from "flurryx";
import type { ResourceState, KeyedResourceData } from "flurryx";
```

For the Angular HTTP error normalizer (optional — keeps `@angular/common/http` out of your bundle unless you need it):

```typescript
import { httpErrorNormalizer } from "flurryx/http";
```

**Peer dependencies** (you likely already have these):

| Peer              | Version                           |
| ----------------- | --------------------------------- |
| `@angular/core`   | `>=17`                            |
| `rxjs`            | `>=7`                             |
| `@angular/common` | optional, only for `flurryx/http` |

> **Note:** Your `tsconfig.json` must include `"experimentalDecorators": true` if you use `@SkipIfCached` or `@Loading`.

<details>
<summary>Individual packages</summary>

If you prefer granular control over your dependency tree, the internal packages are published independently:

```
@flurryx/core   →  Types, models, utilities             (0 runtime deps)
@flurryx/store  →  BaseStore with Angular signals        (peer: @angular/core >=17)
@flurryx/rx     →  RxJS operators + decorators           (peer: rxjs >=7, @angular/core >=17)
```

```bash
npm install @flurryx/core @flurryx/store @flurryx/rx
```

```
@flurryx/core  ←── @flurryx/store
                        ↑
                   @flurryx/rx
```

</details>

---

## Getting Started

### Step 1 — Define your store

Define a TypeScript interface mapping slot names to their data types, then pass it to the `Store` builder:

```typescript
import { Store } from "flurryx";

interface ProductStoreConfig {
  LIST: Product[];
  DETAIL: Product;
}

export const ProductStore = Store.for<ProductStoreConfig>().build();
```

That's it. The interface is type-only — zero runtime cost. The builder returns an `InjectionToken` with `providedIn: 'root'`. Every call to `store.get('LIST')` returns `WritableSignal<ResourceState<Product[]>>`, and invalid keys or mismatched types are caught at compile time.

### Step 2 — Create a facade

The facade owns the store and exposes signals + data-fetching methods.

```typescript
import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { syncToStore, SkipIfCached, Loading } from "flurryx";

@Injectable({ providedIn: "root" })
export class ProductFacade {
  private readonly http = inject(HttpClient);
  readonly store = inject(ProductStore);

  // Expose signals for templates
  readonly list = this.store.get('LIST');
  readonly detail = this.store.get('DETAIL');

  @SkipIfCached('LIST', (i: ProductFacade) => i.store)
  @Loading('LIST', (i: ProductFacade) => i.store)
  loadProducts() {
    this.http
      .get<Product[]>("/api/products")
      .pipe(syncToStore(this.store, 'LIST'))
      .subscribe();
  }

  @Loading('DETAIL', (i: ProductFacade) => i.store)
  loadProduct(id: string) {
    this.http
      .get<Product>(`/api/products/${id}`)
      .pipe(syncToStore(this.store, 'DETAIL'))
      .subscribe();
  }
}
```

### Step 3 — Use in your component

```typescript
@Component({
  template: `
    @if (facade.list().isLoading) {
    <spinner />
    } @if (facade.list().status === 'Success') { @for (product of
    facade.list().data; track product.id) {
    <product-card [product]="product" />
    } } @if (facade.list().status === 'Error') {
    <error-banner [errors]="facade.list().errors" />
    }
  `,
})
export class ProductListComponent {
  readonly facade = inject(ProductFacade);

  constructor() {
    this.facade.loadProducts();
  }
}
```

The component reads signals directly. No `async` pipe, no `subscribe`, no `OnDestroy` cleanup.

---

## How to Use

### ResourceState

The fundamental unit of state. Every store slot holds one:

```typescript
interface ResourceState<T> {
  isLoading?: boolean;
  data?: T;
  status?: "Success" | "Error";
  errors?: Array<{ code: string; message: string }>;
}
```

A slot starts as `{ data: undefined, isLoading: false, status: undefined, errors: undefined }` and transitions through a predictable lifecycle:

```
  ┌─────────┐   startLoading   ┌───────────┐   next    ┌─────────┐
  │  IDLE   │ ───────────────→ │  LOADING  │ ────────→ │ SUCCESS │
  └─────────┘                  └───────────┘           └─────────┘
                                     │
                                     │ error
                                     ▼
                               ┌───────────┐
                               │   ERROR   │
                               └───────────┘
```

### Store API

The `Store` builder creates a store backed by `WritableSignal<ResourceState>` per slot. Three creation styles are available:

```typescript
// 1. Interface-based (recommended) — type-safe with zero boilerplate
interface MyStoreConfig {
  USERS: User[];
  SELECTED: User;
}
export const MyStore = Store.for<MyStoreConfig>().build();

// 2. Fluent chaining — inline slot definitions
export const MyStore = Store
  .resource('USERS').as<User[]>()
  .resource('SELECTED').as<User>()
  .build();

// 3. Enum-constrained — validates keys against a runtime enum
export const MyStore = Store.for(MyStoreEnum)
  .resource('USERS').as<User[]>()
  .resource('SELECTED').as<User>()
  .build();
```

Once injected, the store exposes these methods:

| Method                    | Description                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `get(key)`                | Returns the `WritableSignal` for a slot                                               |
| `update(key, partial)`    | Merges partial state (immutable spread)                                               |
| `clear(key)`              | Resets a slot to its initial empty state                                              |
| `clearAll()`              | Resets every slot                                                                     |
| `startLoading(key)`       | Sets `isLoading: true`, clears `status` and `errors`                                  |
| `stopLoading(key)`        | Sets `isLoading: false`, clears `status` and `errors`                                 |
| `onUpdate(key, callback)` | Registers a listener fired after `update` or `clear`. Returns an unsubscribe function |

**Keyed methods** (for `KeyedResourceData` slots):

| Method                                     | Description                            |
| ------------------------------------------ | -------------------------------------- |
| `updateKeyedOne(key, resourceKey, entity)` | Merges one entity into a keyed slot    |
| `clearKeyedOne(key, resourceKey)`          | Removes one entity from a keyed slot   |
| `startKeyedLoading(key, resourceKey)`      | Sets loading for a single resource key |

> Update hooks are stored in a `WeakMap` keyed by store instance, so garbage collection works naturally across multiple store lifetimes.

### Store Creation Styles

#### Interface-based: `Store.for<Config>().build()`

The recommended approach. Define a TypeScript interface where keys are slot names and values are the data types:

```typescript
import { Store } from "flurryx";

interface ChatStoreConfig {
  SESSIONS: ChatSession[];
  CURRENT_SESSION: ChatSession;
  MESSAGES: ChatMessage[];
}

export const ChatStore = Store.for<ChatStoreConfig>().build();
```

The generic argument is type-only — there is no runtime enum or config object. Under the hood, the store lazily creates signals on first access, so un-accessed keys have zero overhead.

Type safety is fully enforced:

```typescript
const store = inject(ChatStore);

store.get('SESSIONS');                          // WritableSignal<ResourceState<ChatSession[]>>
store.update('SESSIONS', { data: [session] });  // ✅ type-checked
store.update('SESSIONS', { data: 42 });         // ❌ TS error — number is not ChatSession[]
store.get('INVALID');                           // ❌ TS error — key does not exist
```

#### Fluent chaining: `Store.resource().as<T>().build()`

Define slots inline without a separate interface:

```typescript
export const ChatStore = Store
  .resource('SESSIONS').as<ChatSession[]>()
  .resource('CURRENT_SESSION').as<ChatSession>()
  .resource('MESSAGES').as<ChatMessage[]>()
  .build();
```

#### Enum-constrained: `Store.for(enum).resource().as<T>().build()`

When you have a runtime enum (e.g. shared with backend code), pass it to `.for()` to ensure every key is accounted for:

```typescript
const ChatStoreEnum = {
  SESSIONS: 'SESSIONS',
  CURRENT_SESSION: 'CURRENT_SESSION',
  MESSAGES: 'MESSAGES',
} as const;

export const ChatStore = Store.for(ChatStoreEnum)
  .resource('SESSIONS').as<ChatSession[]>()
  .resource('CURRENT_SESSION').as<ChatSession>()
  .resource('MESSAGES').as<ChatMessage[]>()
  .build();
```

The builder only allows keys from the enum, and `.build()` is only available once all keys have been defined.

### syncToStore

RxJS pipeable operator that bridges an `Observable` to a store slot.

```typescript
this.http
  .get<Product[]>("/api/products")
  .pipe(syncToStore(this.store, 'LIST'))
  .subscribe();
```

**What it does:**

- On `next` — writes `{ data, isLoading: false, status: 'Success', errors: undefined }`
- On `error` — writes `{ data: undefined, isLoading: false, status: 'Error', errors: [...] }`
- Completes after first emission by default (`take(1)`)

**Options:**

```typescript
syncToStore(store, key, {
  completeOnFirstEmission: true, // default: true — applies take(1)
  callbackAfterComplete: () => {}, // runs in finalize()
  errorNormalizer: myNormalizer, // default: defaultErrorNormalizer
});
```

### syncToKeyedStore

Same pattern, but targets a specific resource key within a `KeyedResourceData` slot:

```typescript
this.http
  .get<Invoice>(`/api/invoices/${id}`)
  .pipe(syncToKeyedStore(this.store, 'ITEMS', id))
  .subscribe();
```

Only the targeted resource key is updated. Other keys in the same slot are untouched.

**`mapResponse`** — transform the API response before writing to the store:

```typescript
syncToKeyedStore(this.store, 'ITEMS', id, {
  mapResponse: (response) => response.data,
});
```

### @SkipIfCached

Method decorator that skips execution when the store already has valid data.

```typescript
@SkipIfCached('LIST', (i) => i.store)
loadProducts() { /* only runs when cache is stale */ }
```

**Cache hit** (method skipped) when:

- `status === 'Success'` or `isLoading === true`
- Timeout has not expired (default: 5 minutes)
- Method arguments match (compared via `JSON.stringify`)

**Cache miss** (method executes) when:

- Initial state (no status, not loading)
- `status === 'Error'` (errors are never cached)
- Timeout expired
- Arguments changed

**Parameters:**

```typescript
@SkipIfCached(
  'LIST',                       // which store slot to check
  (instance) => instance.store, // how to get the store from `this`
  returnObservable?,            // false (default): void methods; true: returns Observable
  timeoutMs?                    // default: 300_000 (5 min). Use CACHE_NO_TIMEOUT for infinite
)
```

**Observable mode** (`returnObservable: true`):

- Cache hit returns `of(cachedData)` or coalesces onto the in-flight `Observable` via `shareReplay`
- Cache miss executes the method and wraps the result with inflight tracking

**Keyed resources**: When the first argument is a `string | number` and the store data is a `KeyedResourceData`, cache entries are tracked per resource key automatically.

### @Loading

Method decorator that calls `store.startLoading(key)` before the original method executes.

```typescript
@Loading('LIST', (i) => i.store)
loadProducts() { /* store.isLoading is already true when this runs */ }
```

**Keyed detection**: If the first argument is a `string | number` and the store has `startKeyedLoading`, it calls that instead for per-key loading state.

**Compose both decorators** for the common pattern:

```typescript
@SkipIfCached('LIST', (i) => i.store)
@Loading('LIST', (i) => i.store)
loadProducts() {
  this.http.get('/api/products')
    .pipe(syncToStore(this.store, 'LIST'))
    .subscribe();
}
```

Order matters: `@SkipIfCached` is outermost so it can short-circuit before `@Loading` sets the loading flag.

### Error Normalization

Operators accept a pluggable `errorNormalizer` instead of coupling to Angular's `HttpErrorResponse`:

```typescript
type ErrorNormalizer = (error: unknown) => ResourceErrors;
```

**`defaultErrorNormalizer`** (used by default) handles:

1. `{ error: { errors: [...] } }` — extracts the nested array
2. `{ status: number, message: string }` — wraps into `[{ code, message }]`
3. `Error` instances — wraps `error.message`
4. Anything else — `[{ code: 'UNKNOWN', message: String(error) }]`

**`httpErrorNormalizer`** — for Angular's `HttpErrorResponse`, available from a separate entry point to keep `@angular/common/http` out of your bundle unless you need it:

```typescript
import { httpErrorNormalizer } from "flurryx/http";

this.http
  .get("/api/data")
  .pipe(
    syncToStore(this.store, 'DATA', {
      errorNormalizer: httpErrorNormalizer,
    }),
  )
  .subscribe();
```

**Custom normalizer** — implement your own for any backend error shape:

```typescript
const myNormalizer: ErrorNormalizer = (error) => {
  const typed = error as MyBackendError;
  return typed.details.map((d) => ({
    code: d.errorCode,
    message: d.userMessage,
  }));
};
```

### Constants

```typescript
import { CACHE_NO_TIMEOUT, DEFAULT_CACHE_TTL_MS } from "flurryx";

CACHE_NO_TIMEOUT; // Infinity — cache never expires
DEFAULT_CACHE_TTL_MS; // 300_000 (5 minutes)
```

---

## Keyed Resources

For data indexed by ID (user profiles, invoices, config entries), use `KeyedResourceData`:

```typescript
interface KeyedResourceData<TKey extends string | number, TValue> {
  entities: Partial<Record<TKey, TValue>>;
  isLoading: Partial<Record<TKey, boolean>>;
  status: Partial<Record<TKey, ResourceStatus>>;
  errors: Partial<Record<TKey, ResourceErrors>>;
}
```

Each resource key gets **independent** loading, status, and error tracking. The top-level `ResourceState.isLoading` reflects whether _any_ key is loading.

**Full example:**

```typescript
// Store
import { Store } from "flurryx";
import type { KeyedResourceData } from "flurryx";

export const InvoiceStore = Store
  .resource('ITEMS').as<KeyedResourceData<string, Invoice>>()
  .build();

// Facade
@Injectable({ providedIn: "root" })
export class InvoiceFacade {
  private readonly http = inject(HttpClient);
  readonly store = inject(InvoiceStore);
  readonly items = this.store.get('ITEMS');

  @SkipIfCached('ITEMS', (i: InvoiceFacade) => i.store)
  @Loading('ITEMS', (i: InvoiceFacade) => i.store)
  loadInvoice(id: string) {
    this.http
      .get<Invoice>(`/api/invoices/${id}`)
      .pipe(syncToKeyedStore(this.store, 'ITEMS', id))
      .subscribe();
  }
}

// Component
const data = this.facade.items().data; // KeyedResourceData
const invoice = data?.entities["inv-123"]; // Invoice | undefined
const loading = data?.isLoading["inv-123"]; // boolean | undefined
const errors = data?.errors["inv-123"]; // ResourceErrors | undefined
```

**Utilities:**

```typescript
import {
  createKeyedResourceData, // factory — returns empty { entities: {}, isLoading: {}, ... }
  isKeyedResourceData, // type guard
  isAnyKeyLoading, // (loading: Record) => boolean
} from "flurryx";
```

---

## Design Decisions

**Why signals instead of BehaviorSubject?**
Angular signals are synchronous, glitch-free, and template-native. They eliminate the need for `async` pipe, `shareReplay`, and manual unsubscription in components. RxJS stays in the service/facade layer where it belongs — for async operations.

**Why not NgRx / NGXS / Elf?**
Those are general-purpose state management libraries with actions, reducers, and effects. flurryx solves a narrower problem: the loading/data/error lifecycle of API calls. If your needs are "fetch data, show loading, handle errors, cache results", flurryx is the right size.

**Why `Partial<Record>` instead of `Map` for keyed data?**
Plain objects work with Angular's change detection and signals out of the box. Maps require additional serialization. This also means zero migration friction.

**Why `experimentalDecorators`?**
The decorators use TypeScript's legacy decorator syntax. TC39 decorator migration is planned for a future release.

**Why tsup instead of ng-packagr?**
flurryx contains no Angular components, templates, or directives — just TypeScript that calls `signal()` at runtime. Angular Package Format (APF) adds complexity without benefit here. tsup produces ESM + CJS + `.d.ts` in milliseconds.

---

## Contributing

```bash
git clone https://github.com/fmflurry/flurryx.git
cd flurryx
npm install
npm run build
npm run test
```

| Command                 | What it does                                     |
| ----------------------- | ------------------------------------------------ |
| `npm run build`         | Builds all packages (ESM + CJS + .d.ts) via tsup |
| `npm run test`          | Runs vitest across all packages                  |
| `npm run test:coverage` | Tests with v8 coverage report                    |
| `npm run typecheck`     | `tsc --noEmit` across all packages               |

Monorepo managed with **npm workspaces**. Versioning with [changesets](https://github.com/changesets/changesets).

---

## License

[MIT](LICENSE)
