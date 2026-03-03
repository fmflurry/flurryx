import { InjectionToken } from "@angular/core";
import { BaseStore } from "./base-store";
import { DynamicStore } from "./dynamic-store";
import { LazyStore } from "./lazy-store";
import { resource } from "./resource";
import type {
  StoreConfig,
  ResourceDef,
  InferEnum,
  InferData,
  ConfigToData,
  IStore,
} from "./types";

// ---------------------------------------------------------------------------
// Unconstrained builder (existing API)
// ---------------------------------------------------------------------------

/**
 * Intermediate builder step after .resource('key') — awaits .as<T>().
 */
interface AsStep<TAccum extends StoreConfig, TKey extends string> {
  as<T>(): StoreBuilder<TAccum & Record<TKey, ResourceDef<T>>>;
}

/**
 * Fluent builder for creating stores.
 * Accumulates resource definitions then produces an InjectionToken on .build().
 */
interface StoreBuilder<TAccum extends StoreConfig> {
  resource<TKey extends string>(key: TKey): AsStep<TAccum, TKey>;
  build(): InjectionToken<BaseStore<InferEnum<TAccum>, InferData<TAccum>>>;
}

function createBuilder<TAccum extends StoreConfig>(
  accum: TAccum
): StoreBuilder<TAccum> {
  return {
    resource<TKey extends string>(key: TKey): AsStep<TAccum, TKey> {
      return {
        as<T>(): StoreBuilder<TAccum & Record<TKey, ResourceDef<T>>> {
          const nextAccum = {
            ...accum,
            [key]: resource<T>(),
          } as TAccum & Record<TKey, ResourceDef<T>>;
          return createBuilder(nextAccum);
        },
      };
    },
    build() {
      return new InjectionToken<
        BaseStore<InferEnum<TAccum>, InferData<TAccum>>
      >("FlurryxStore", {
        providedIn: "root",
        factory: () => new DynamicStore(accum),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Constrained builder (.for(enum) API)
// ---------------------------------------------------------------------------

/** Keys from the enum that have NOT yet been defined. */
type Remaining<
  TEnum extends Record<string, string>,
  TAccum extends StoreConfig
> = Exclude<keyof TEnum & string, keyof TAccum>;

/** Intermediate .as<T>() step for the constrained builder. */
interface ConstrainedAsStep<
  TEnum extends Record<string, string>,
  TAccum extends StoreConfig,
  TKey extends string
> {
  as<T>(): ConstrainedBuilder<TEnum, TAccum & Record<TKey, ResourceDef<T>>>;
}

/**
 * Constrained builder — only allows keys from the enum that haven't been
 * defined yet. `.build()` is only available when all keys are accounted for.
 */
type ConstrainedBuilder<
  TEnum extends Record<string, string>,
  TAccum extends StoreConfig
> = [Remaining<TEnum, TAccum>] extends [never]
  ? {
      build(): InjectionToken<BaseStore<InferEnum<TAccum>, InferData<TAccum>>>;
    }
  : {
      resource<TKey extends Remaining<TEnum, TAccum>>(
        key: TKey
      ): ConstrainedAsStep<TEnum, TAccum, TKey>;
    };

function createConstrainedBuilder<
  TEnum extends Record<string, string>,
  TAccum extends StoreConfig
>(_enumObj: TEnum, accum: TAccum): ConstrainedBuilder<TEnum, TAccum> {
  return {
    resource<TKey extends string>(
      key: TKey
    ): ConstrainedAsStep<TEnum, TAccum, TKey> {
      return {
        as<T>(): ConstrainedBuilder<
          TEnum,
          TAccum & Record<TKey, ResourceDef<T>>
        > {
          const nextAccum = {
            ...accum,
            [key]: resource<T>(),
          } as TAccum & Record<TKey, ResourceDef<T>>;
          return createConstrainedBuilder(_enumObj, nextAccum);
        },
      };
    },
    build() {
      return new InjectionToken<
        BaseStore<InferEnum<TAccum>, InferData<TAccum>>
      >("FlurryxStore", {
        providedIn: "root",
        factory: () => new DynamicStore(accum),
      });
    },
  } as ConstrainedBuilder<TEnum, TAccum>;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

interface StoreEntry {
  /**
   * Define a named resource slot.
   * Chain .as<T>() to assign its type, then continue with more .resource() calls
   * or call .build() when done.
   */
  resource<TKey extends string>(
    key: TKey
  ): {
    as<T>(): StoreBuilder<Record<TKey, ResourceDef<T>>>;
  };

  /**
   * Interface-based builder: pass a config interface as a generic.
   * No runtime argument needed — keys and types are inferred from the interface.
   *
   * @example
   * interface ChatStoreConfig {
   *   SESSIONS: ChatSession[];
   *   MESSAGES: ChatMessage[];
   * }
   * const ChatStore = Store.for<ChatStoreConfig>().build();
   */
  for<TConfig extends Record<string, unknown>>(): {
    build(): InjectionToken<IStore<ConfigToData<TConfig>>>;
  };

  /**
   * Bind the builder to an enum object for compile-time key validation.
   *
   * @example
   * const Enum = { A: 'A', B: 'B' } as const;
   * const MyStore = Store.for(Enum)
   *   .resource('A').as<string>()
   *   .resource('B').as<number>()
   *   .build();
   */
  for<TEnum extends Record<string, string>>(
    enumObj: TEnum
  ): ConstrainedBuilder<TEnum, Record<string, never>>;
}

/**
 * Fluent store builder entry point.
 *
 * @example
 * // Unconstrained
 * export const CustomersStore = Store
 *   .resource('customers').as<Customer[]>()
 *   .resource('customerDetails').as<Customer>()
 *   .build();
 *
 * @example
 * // Constrained with enum
 * const Enum = { SESSIONS: 'SESSIONS', MESSAGES: 'MESSAGES' } as const;
 * export const ChatStore = Store.for(Enum)
 *   .resource('SESSIONS').as<Session[]>()
 *   .resource('MESSAGES').as<Message[]>()
 *   .build();
 */
export const Store: StoreEntry = {
  ...createBuilder({} as StoreConfig),
  for(enumObj?: Record<string, string>) {
    if (arguments.length === 0) {
      return {
        build() {
          return new InjectionToken("FlurryxStore", {
            providedIn: "root",
            factory: () => new LazyStore(),
          });
        },
      };
    }
    return createConstrainedBuilder(enumObj!, {} as Record<string, never>);
  },
};
