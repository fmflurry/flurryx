import type { ResourceDef } from './types';

/**
 * Creates a phantom-typed resource definition marker.
 * Zero runtime cost — returns an empty object that only carries type info.
 *
 * @example
 * const config = {
 *   customers: resource<Customer[]>(),
 *   customerDetails: resource<Customer>(),
 * };
 */
export function resource<T>(): ResourceDef<T> {
  return {} as ResourceDef<T>;
}
