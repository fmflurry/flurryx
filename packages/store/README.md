# @flurryx/store

Signal-based reactive store for Angular. Part of the [flurryx](../../README.md) monorepo.

## Installation

```bash
npm install @flurryx/store
```

Or use the umbrella package which re-exports everything:

```bash
npm install flurryx
```

## Store Creation

Three builder styles are available:

```typescript
import { Store } from "@flurryx/store";

// 1. Interface-based (recommended)
interface MyStoreConfig {
  USERS: User[];
  SELECTED: User;
}
export const MyStore = Store.for<MyStoreConfig>().build();

// 2. Fluent chaining
export const MyStore = Store
  .resource('USERS').as<User[]>()
  .resource('SELECTED').as<User>()
  .build();

// 3. Enum-constrained
const Enum = { USERS: 'USERS', SELECTED: 'SELECTED' } as const;
export const MyStore = Store.for(Enum)
  .resource('USERS').as<User[]>()
  .resource('SELECTED').as<User>()
  .build();
```

## Store API

### Basic operations

| Method | Description |
|---|---|
| `get(key)` | Returns the `Signal` for a slot |
| `update(key, partial)` | Merges partial state (immutable spread) |
| `clear(key)` | Resets a slot to its initial empty state |
| `clearAll()` | Resets every slot in one store |
| `clearAllStores()` | Resets every tracked store instance |
| `startLoading(key)` | Sets `isLoading: true`, clears `status` and `errors` |
| `stopLoading(key)` | Sets `isLoading: false`, clears `status` and `errors` |
| `onUpdate(key, callback)` | Registers a listener fired after `update` or `clear`. Returns an unsubscribe function |

### Keyed operations

For slots holding `KeyedResourceData<TKey, TValue>`:

When keyed fetches use `syncToKeyedStore(..., resourceKey)`, keyed slot is bootstrapped on subscribe so per-key loading state exists before first response.

| Method | Description |
|---|---|
| `updateKeyedOne(key, resourceKey, entity)` | Merges one entity into a keyed slot |
| `clearKeyedOne(key, resourceKey)` | Removes one entity from a keyed slot |
| `startKeyedLoading(key, resourceKey)` | Sets loading for a single resource key |

### Read-only signals

`get(key)` returns a **read-only `Signal`**, not a `WritableSignal`. Consumers can read state but cannot mutate it directly — all writes must go through the store's own methods (`update`, `clear`, `startLoading`, …). This enforces strict encapsulation: the store is the single owner of its state, and external code can only observe it.

## Clearing Store Data

### Whole-slot clearing

Reset an entire store slot back to its initial empty state:

```typescript
const store = inject(ProductStore);

// Clear a single slot
store.clear('LIST');

// Clear every slot in the store
store.clearAll();

// Clear every tracked store instance in the app
clearAllStores();
```

Import `clearAllStores` when you need a global cache reset, such as logout or tenant switching:

```typescript
import { clearAllStores } from "@flurryx/store";

logout() {
  clearAllStores();
}
```

### Per-key clearing for keyed resources

When a slot holds a `KeyedResourceData`, `clear('ITEMS')` wipes **every** cached entity. To invalidate a single entry, use `clearKeyedOne`:

```typescript
import { Store } from "@flurryx/store";
import type { KeyedResourceData } from "@flurryx/core";

// Define a store with a keyed slot
interface InvoiceStoreConfig {
  ITEMS: KeyedResourceData<string, Invoice>;
}
export const InvoiceStore = Store.for<InvoiceStoreConfig>().build();
```

```typescript
const store = inject(InvoiceStore);

// Remove only invoice "inv-42" from the cache.
// All other cached invoices remain untouched.
store.clearKeyedOne('ITEMS', 'inv-42');
```

`clearKeyedOne` removes the entity, its loading flag, status, and errors for that key, then recalculates the top-level `isLoading` based on remaining keys.

**Facade example:**

```typescript
@Injectable({ providedIn: 'root' })
export class InvoiceFacade {
  private readonly http = inject(HttpClient);
  readonly store = inject(InvoiceStore);

  deleteInvoice(id: string) {
    this.http.delete(`/api/invoices/${id}`).subscribe(() => {
      // Evict only this invoice from the keyed cache
      this.store.clearKeyedOne('ITEMS', id);
    });
  }
}
```

**Comparison:**

| Method | Scope | Use when |
|---|---|---|
| `clear(key)` | Entire slot | Logging out, resetting a form, full refresh |
| `clearAll()` | Every slot in one store | Reset one feature store |
| `clearAllStores()` | Every tracked store instance | Logout, tenant switch, full app cache reset |
| `clearKeyedOne(key, resourceKey)` | Single entity in a keyed slot | Deleting or invalidating one cached item |

## Store Composition

The store builder supports `.mirror()`, `.mirrorSelf()`, `.derive()`, `.deriveSelf()`, and `.mirrorKeyed()` for declarative synchronization.

Use `.mirrorSelf(sourceKey, targetKey)` when two slots inside the same store should stay in sync:

```typescript
interface SessionStoreConfig {
  CUSTOMER_DETAILS: Customer;
  CUSTOMER_SNAPSHOT: Customer;
}

export const SessionStore = Store.for<SessionStoreConfig>()
  .mirrorSelf('CUSTOMER_DETAILS', 'CUSTOMER_SNAPSHOT')
  .build();
```

Use `.derive()` when a target slot should be computed from another store's slot while still mirroring loading, status, and errors from the source:

```typescript
interface CompanyStoreConfig {
  COMPANIES: Company[];
}

export const CompanyStore = Store.for<CompanyStoreConfig>().build();

interface SessionStoreConfig {
  ONLY_COMPANY: Company | null;
  SINGLE: boolean;
}

export const SessionStore = Store.for<SessionStoreConfig>()
  .derive(CompanyStore, 'COMPANIES', 'ONLY_COMPANY', {
    mapData: (companies) =>
      companies?.length === 1 ? (companies[0] ?? null) : null,
  })
  .derive(CompanyStore, 'COMPANIES', 'SINGLE', {
    mapData: (companies) => (companies?.length ?? 0) === 1,
  })
  .build();
```

Use `.deriveSelf()` when the source of truth lives in the same store:

```typescript
interface InvalidConfigStoreConfig {
  COMPANIES: Company[];
  ONLY_COMPANY: Company | null;
  SINGLE: boolean;
}

export const InvalidConfigStore = Store.for<InvalidConfigStoreConfig>()
  .deriveSelf('COMPANIES', 'ONLY_COMPANY', {
    mapData: (companies) =>
      companies?.length === 1 ? (companies[0] ?? null) : null,
  })
  .deriveSelf('COMPANIES', 'SINGLE', {
    mapData: (companies) => (companies?.length ?? 0) === 1,
  })
  .build();
```

Derived targets update whenever the source state changes, including loading transitions and store history restore operations.

See the [root README](../../README.md#store-mirroring) for full composition documentation and more examples.

## License

[MIT](../../LICENSE)
