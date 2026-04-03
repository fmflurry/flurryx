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
 * Each entity gets **independent** loading, status, and error tracking.
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
 * const invoice = data?.entities['inv-123'];
 * const loading = data?.isLoading['inv-123'];
 * const errors  = data?.errors['inv-123'];
 * ```
 */
export interface KeyedResourceData<TKey extends KeyedResourceKey, TValue> {
  /** Map of entity ID → entity value. */
  entities: Partial<Record<TKey, TValue>>;
  /** Map of entity ID → whether that entity is currently loading. */
  isLoading: Partial<Record<TKey, boolean>>;
  /** Map of entity ID → resource status (`'Success'` or `'Error'`). */
  status: Partial<Record<TKey, ResourceStatus>>;
  /** Map of entity ID → error array for that entity. */
  errors: Partial<Record<TKey, ResourceErrors>>;
}

/**
 * Type guard that checks whether a value is a {@link KeyedResourceData} structure.
 *
 * @param value - The value to check.
 * @returns `true` if the value has `entities`, `isLoading`, `status`, and `errors` object fields.
 *
 * @example
 * ```ts
 * const state = store.get('ITEMS')();
 * if (isKeyedResourceData(state.data)) {
 *   console.log(state.data.entities);
 * }
 * ```
 */
export function isKeyedResourceData(
  value: unknown
): value is KeyedResourceData<KeyedResourceKey, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const data = value as Partial<KeyedResourceData<KeyedResourceKey, unknown>>;
  return (
    typeof data.entities === "object" &&
    data.entities !== null &&
    typeof data.isLoading === "object" &&
    data.isLoading !== null &&
    typeof data.status === "object" &&
    data.status !== null &&
    typeof data.errors === "object" &&
    data.errors !== null
  );
}

/**
 * Creates an empty {@link KeyedResourceData} with all maps initialized to `{}`.
 *
 * @template TKey - The entity identifier type.
 * @template TValue - The entity type.
 * @returns A new `KeyedResourceData` with empty `entities`, `isLoading`, `status`, and `errors`.
 *
 * @example
 * ```ts
 * const initial = createKeyedResourceData<string, Invoice>();
 * // { entities: {}, isLoading: {}, status: {}, errors: {} }
 * ```
 */
export function createKeyedResourceData<
  TKey extends KeyedResourceKey,
  TValue
>(): KeyedResourceData<TKey, TValue> {
  return {
    entities: {} as Partial<Record<TKey, TValue>>,
    isLoading: {} as Partial<Record<TKey, boolean>>,
    status: {} as Partial<Record<TKey, ResourceStatus>>,
    errors: {} as Partial<Record<TKey, ResourceErrors>>,
  };
}

/**
 * Checks whether any entity in a keyed loading map is currently loading.
 *
 * @param loading - The `isLoading` map from a {@link KeyedResourceData}.
 * @returns `true` if at least one key has a value of `true`.
 *
 * @example
 * ```ts
 * const data = store.get('ITEMS')().data;
 * if (data && isAnyKeyLoading(data.isLoading)) {
 *   console.log('At least one item is loading');
 * }
 * ```
 */
export function isAnyKeyLoading<TKey extends KeyedResourceKey>(
  loading: Partial<Record<TKey, boolean>>
): boolean {
  return Object.values(loading).some((value) => value === true);
}
