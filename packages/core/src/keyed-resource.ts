import { ResourceState } from "./resource-state";

/**
 * Type for resource keys used to index entities in a {@link KeyedResourceData} slot.
 */
export type KeyedResourceKey = string | number;

/**
 * Literal union for resource status: `'Success'` or `'Error'`.
 */
export type ResourceStatus = NonNullable<ResourceState<unknown>["status"]>;

/**
 * Normalized error array shape: `Array<{ code: string; message: string }>`.
 */
export type ResourceErrors = NonNullable<ResourceState<unknown>["errors"]>;

/**
 * Container for keyed (indexed by ID) resource data.
 *
 * Each entity key points to its own {@link ResourceState}.
 * Use this when a single store slot manages multiple entities (e.g. user profiles by ID).
 *
 * @template TKey - The entity identifier type (`string` or `number`).
 * @template TValue - The entity type.
 *
 * @example
 * ```ts
 * interface InvoiceStoreConfig {
 *   ITEMS: KeyedResourceData<string, Invoice>;
 * }
 *
 * // Accessing per-key state:
 * const data = store.get('ITEMS')().data;
 * const invoice = data?.['inv-123']?.data;
 * const loading = data?.['inv-123']?.isLoading;
 * const errors  = data?.['inv-123']?.errors;
 * ```
 */
export type KeyedResourceData<
  TKey extends KeyedResourceKey,
  TValue,
> = Partial<Record<TKey, ResourceState<TValue>>>;

function isResourceStateValue(value: unknown): value is ResourceState<unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);
  if (keys.length === 0) {
    return false;
  }

  return keys.every(
    (key) =>
      key === "data" ||
      key === "isLoading" ||
      key === "status" ||
      key === "errors"
  );
}

/**
 * Type guard that checks whether a value is a {@link KeyedResourceData} structure.
 *
 * @param value - The value to check.
 * @returns `true` if the value is a keyed object whose entries look like `ResourceState` values.
 *
 * @example
 * ```ts
 * const state = store.get('ITEMS')();
 * if (isKeyedResourceData(state.data)) {
 *   console.log(state.data['inv-123']?.data);
 * }
 * ```
 */
export function isKeyedResourceData(
  value: unknown
): value is KeyedResourceData<KeyedResourceKey, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(isResourceStateValue);
}

/**
 * Creates an empty {@link KeyedResourceData}.
 *
 * @template TKey - The entity identifier type.
 * @template TValue - The entity type.
 * @returns A new `KeyedResourceData` with no keyed entries yet.
 *
 * @example
 * ```ts
 * const initial = createKeyedResourceData<string, Invoice>();
 * // {}
 * ```
 */
export function createKeyedResourceData<
  TKey extends KeyedResourceKey,
  TValue
>(): KeyedResourceData<TKey, TValue> {
  return {} as KeyedResourceData<TKey, TValue>;
}

/**
 * Checks whether any entity in keyed resource data is currently loading.
 *
 * @param data - The keyed resource data.
 * @returns `true` if at least one key has a value of `true`.
 *
 * @example
 * ```ts
 * const data = store.get('ITEMS')().data;
 * if (data && isAnyKeyLoading(data)) {
 *   console.log('At least one item is loading');
 * }
 * ```
 */
export function isAnyKeyLoading<
  TKey extends KeyedResourceKey,
  TValue
>(
  data: KeyedResourceData<TKey, TValue>
): boolean {
  return (Object.values(data) as Array<ResourceState<TValue> | undefined>).some(
    (entry) => entry?.isLoading === true
  );
}
