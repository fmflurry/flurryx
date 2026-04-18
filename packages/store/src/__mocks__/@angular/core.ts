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

export class InjectionToken<T> {
  constructor(
    public readonly description: string,
    public readonly options?: {
      providedIn: string;
      factory: () => T;
    }
  ) {}
}

// ---------------------------------------------------------------------------
// Minimal DI container for testing
// ---------------------------------------------------------------------------

const _providers = new Map<InjectionToken<unknown>, unknown>();

export function inject<T>(token: InjectionToken<T>): T {
  if (_providers.has(token as InjectionToken<unknown>)) {
    return _providers.get(token as InjectionToken<unknown>) as T;
  }
  if (token.options?.factory) {
    const instance = token.options.factory();
    _providers.set(token as InjectionToken<unknown>, instance);
    return instance;
  }
  throw new Error(`NullInjectorError: No provider for ${token.description}`);
}

export function _resetProviders(): void {
  _providers.clear();
}
