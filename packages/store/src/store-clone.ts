import type { ResourceState } from "@flurryx/core";

/**
 * Creates a deep clone of the given value.
 *
 * **Warning:** Class instances with constructor logic, private fields, or
 * non-enumerable state will not clone correctly. The clone preserves the
 * prototype chain via `Object.create(Object.getPrototypeOf(...))` but does
 * **not** invoke the constructor, so any side-effects or hidden state set
 * during construction will be missing from the clone.
 */
export function cloneValue<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    const existingClone = cloneReference(value, new WeakMap<object, unknown>());
    return existingClone as T;
  }

  return value;
}

function cloneReference<T extends object>(
  value: T,
  seen: WeakMap<object, unknown>
): T {
  const seenClone = seen.get(value);
  if (seenClone) {
    return seenClone as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (value instanceof Map) {
    const clonedMap = new Map<unknown, unknown>();
    seen.set(value, clonedMap);
    value.forEach((entryValue, key) => {
      clonedMap.set(cloneValueWithSeen(key, seen), cloneValueWithSeen(entryValue, seen));
    });
    return clonedMap as T;
  }

  if (value instanceof Set) {
    const clonedSet = new Set<unknown>();
    seen.set(value, clonedSet);
    value.forEach((entryValue) => {
      clonedSet.add(cloneValueWithSeen(entryValue, seen));
    });
    return clonedSet as T;
  }

  if (Array.isArray(value)) {
    const clonedArray: unknown[] = [];
    seen.set(value, clonedArray);
    value.forEach((item, index) => {
      clonedArray[index] = cloneValueWithSeen(item, seen);
    });

    return clonedArray as T;
  }

  const clonedObject = Object.create(
    Object.getPrototypeOf(value)
  ) as Record<PropertyKey, unknown>;
  seen.set(value, clonedObject);

  Reflect.ownKeys(value).forEach((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) {
      return;
    }

    if ("value" in descriptor) {
      descriptor.value = cloneValueWithSeen(descriptor.value, seen);
    }

    Object.defineProperty(clonedObject, key, descriptor);
  });

  return clonedObject as T;
}

function cloneValueWithSeen<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (value !== null && typeof value === "object") {
    return cloneReference(value, seen);
  }

  return value;
}

export function createSnapshotRestorePatch<TState extends ResourceState<unknown>>(
  currentState: TState,
  snapshotState: TState
): Partial<TState> {
  const patch: Record<PropertyKey, unknown> = {};
  const keys = new Set([
    ...Reflect.ownKeys(currentState),
    ...Reflect.ownKeys(snapshotState),
  ]);

  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(snapshotState, key)) {
      patch[key] = cloneValue(
        (snapshotState as Record<PropertyKey, unknown>)[key]
      );
      return;
    }

    patch[key] = undefined;
  });

  return patch as Partial<TState>;
}
