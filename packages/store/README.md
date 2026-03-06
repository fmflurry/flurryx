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
| `get(key)` | Returns the `WritableSignal` for a slot |
| `update(key, partial)` | Merges partial state (immutable spread) |
| `clear(key)` | Resets a slot to its initial empty state |
| `clearAll()` | Resets every slot |
| `startLoading(key)` | Sets `isLoading: true`, clears `status` and `errors` |
| `stopLoading(key)` | Sets `isLoading: false`, clears `status` and `errors` |
| `onUpdate(key, callback)` | Registers a listener fired after `update` or `clear`. Returns an unsubscribe function |

### Keyed operations

For slots holding `KeyedResourceData<TKey, TValue>`:

| Method | Description |
|---|---|
| `updateKeyedOne(key, resourceKey, entity)` | Merges one entity into a keyed slot |
| `clearKeyedOne(key, resourceKey)` | Removes one entity from a keyed slot |
| `startKeyedLoading(key, resourceKey)` | Sets loading for a single resource key |

## Clearing Store Data

### Whole-slot clearing

Reset an entire store slot back to its initial empty state:

```typescript
const store = inject(ProductStore);

// Clear a single slot
store.clear('LIST');

// Clear every slot in the store
store.clearAll();
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
| `clearAll()` | Every slot | Session teardown |
| `clearKeyedOne(key, resourceKey)` | Single entity in a keyed slot | Deleting or invalidating one cached item |

## Store Mirroring

The store builder supports `.mirror()` and `.mirrorKeyed()` for declarative cross-store synchronization. See the [root README](../../README.md#store-mirroring) for full documentation.

## License

[MIT](../../LICENSE)
