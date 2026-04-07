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

export class InjectionToken<T> {
  constructor(
    public readonly description: string,
    public readonly options?: {
      providedIn: string;
      factory: () => T;
    }
  ) {}
}

const providers = new Map<InjectionToken<unknown>, unknown>();

export function inject<T>(token: InjectionToken<T>): T {
  if (providers.has(token as InjectionToken<unknown>)) {
    return providers.get(token as InjectionToken<unknown>) as T;
  }
  if (token.options?.factory) {
    const instance = token.options.factory();
    providers.set(token as InjectionToken<unknown>, instance);
    return instance;
  }
  throw new Error(`NullInjectorError: No provider for ${token.description}`);
}

export function _resetProviders(): void {
  providers.clear();
}
