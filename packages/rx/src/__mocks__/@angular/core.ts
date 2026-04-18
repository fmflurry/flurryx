export type Signal<T> = {
  (): T;
};

export type WritableSignal<T> = Signal<T> & {
  set: (value: T) => void;
  update: (fn: (value: T) => T) => void;
  asReadonly: () => Signal<T>;
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

  getter.asReadonly = () => getter as Signal<T>;

  return getter;
}

export function computed<T>(fn: () => T): Signal<T> {
  return (() => fn()) as Signal<T>;
}

export function untracked<T>(fn: () => T): T {
  return fn();
}
