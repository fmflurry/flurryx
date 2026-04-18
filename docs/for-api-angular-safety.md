# flurryx `.for()` Angular Safety Note

## Problem

`get(key).for(resourceKey)` looks like read API, but current impl can write to store during read.

Current behavior in keyed accessor is effectively:

```ts
const current = slotSignal().data[resourceKey];

if (!current) {
  store.ensureKeyedSlot(key, resourceKey);
}

return slotSignal().data[resourceKey] ?? createDefaultState();
```

This is unsafe in Angular signals world.

In our webapp, `.for(signalId)` is read from Angular `computed()` and from template-driven reactive evaluation. If `.for()` publishes store updates during that read, Angular throws:

```text
NG0600: Writing to signals is not allowed in a computed
```

Result in app:

- loader can stay stuck
- success state may not render
- UI refresh becomes inconsistent

## Root Cause

`.for()` mixes 2 responsibilities:

1. read keyed state
2. lazily materialize missing keyed slot

That second responsibility is write-side behavior and must not happen inside a getter.

## Required Change

Make `.for()` pure read API.

Target behavior:

```ts
const current = slotSignal().data?.[resourceKey];
return current ?? createDefaultState();
```

Rules:

- `.for(...)` must never publish
- `.for(...)` must never call `ensureKeyedSlot`
- `.for(...)` must never mutate history/store state
- missing key must return default resource state only

## What Must Move Out Of `.for()`

Any slot creation/init behavior must move to explicit write/init APIs only, for example:

- `startKeyedLoading(key, resourceKey)`
- `updateKeyedOne(key, resourceKey, entity)`
- `clearKeyedOne(key, resourceKey)`
- optional explicit API like `ensureKeyedSlot` / `initKeyedSlot`

If explicit materialization is still wanted, it should be opt-in, not default.

Possible safe alternatives:

```ts
store.ensureKeyedSlot(key, resourceKey);
store.initKeyedSlot(key, resourceKey);
get(key).for(resourceKey, { ensure: true });
```

Recommended default:

- `.for(...)` stays pure
- init/ensure stays explicit

## Why This Is Needed For Our Webapp

Our Angular app uses `.for(signalId)` inside reactive reads.

Example pattern:

```ts
readonly purchaseOrderDetails =
  this.purchaseOrderDetailsFacade.getPurchaseOrderDetails(this.purchaseOrderId);

readonly isLoading = computed(() => this.purchaseOrderDetails().isLoading);
readonly purchaseOrder = computed(() => this.purchaseOrderDetails().data);
```

This pattern is valid only if `.for(signalId)` is read-only.

If `.for(signalId)` writes on missing key, first render can fail before `startKeyedLoading()` / `updateKeyedOne()` settle state.

## Backward Compatibility Note

Behavior change:

- today: reading missing key may create empty keyed slot in store
- after fix: reading missing key returns default state but does not materialize slot

If any existing consumers depend on "read creates slot", they must switch to explicit init.

This is good breakage because current implicit behavior is unsafe and surprising.

## Recommended flurryx Tests

Add regression coverage for these cases:

1. reading `.for(signalId)` inside Angular `computed()` does not throw
2. reading missing keyed resource does not mutate store
3. `.for(signalId)` follows signal key changes reactively
4. `startKeyedLoading(key, id)` then `.for(id)` returns loading state
5. `updateKeyedOne(key, id, entity)` then `.for(id)` returns success state
6. no history/publish side effect happens from plain read

## Short Decision

`.for()` currently behaves like hidden setter.

To work properly in our Angular webapp, `.for()` must become pure getter.
