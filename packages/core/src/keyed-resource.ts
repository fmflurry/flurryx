import { ResourceState } from './resource-state';

export type KeyedResourceKey = string | number;

export type ResourceStatus = NonNullable<ResourceState<unknown>['status']>;
export type ResourceErrors = NonNullable<ResourceState<unknown>['errors']>;

export interface KeyedResourceData<TKey extends KeyedResourceKey, TValue> {
  entities: Partial<Record<TKey, TValue>>;
  isLoading: Partial<Record<TKey, boolean>>;
  status: Partial<Record<TKey, ResourceStatus>>;
  errors: Partial<Record<TKey, ResourceErrors>>;
}

export function isKeyedResourceData(
  value: unknown
): value is KeyedResourceData<KeyedResourceKey, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const data = value as Partial<KeyedResourceData<KeyedResourceKey, unknown>>;
  return (
    typeof data.entities === 'object' &&
    data.entities !== null &&
    typeof data.isLoading === 'object' &&
    data.isLoading !== null &&
    typeof data.status === 'object' &&
    data.status !== null &&
    typeof data.errors === 'object' &&
    data.errors !== null
  );
}

export function createKeyedResourceData<
  TKey extends KeyedResourceKey,
  TValue,
>(): KeyedResourceData<TKey, TValue> {
  return {
    entities: {} as Partial<Record<TKey, TValue>>,
    isLoading: {} as Partial<Record<TKey, boolean>>,
    status: {} as Partial<Record<TKey, ResourceStatus>>,
    errors: {} as Partial<Record<TKey, ResourceErrors>>,
  };
}

export function isAnyKeyLoading<TKey extends KeyedResourceKey>(
  loading: Partial<Record<TKey, boolean>>
): boolean {
  return Object.values(loading).some((value) => value === true);
}
