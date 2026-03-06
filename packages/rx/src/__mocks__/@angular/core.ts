export type Signal<T> = {
  (): T;
};

export type WritableSignal<T> = Signal<T> & {
  set: (value: T) => void;
  update: (fn: (value: T) => T) => void;
};

export function signal<T>(initialValue: T): WritableSignal<T> {
  let value = initialValue;

  const getter = (() => value) as WritableSignal<T>;

  getter.set = (newValue: T) => {
    value = newValue;
  };

  getter.update = (fn: (current: T) => T) => {
    value = fn(value);
  };

  return getter;
}
