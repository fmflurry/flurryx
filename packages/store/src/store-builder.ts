import { InjectionToken, inject } from "@angular/core";
import { BaseStore } from "./base-store";
import { DynamicStore } from "./dynamic-store";
import { LazyStore } from "./lazy-store";
import { mirrorKey } from "./mirror-key";
import { collectKeyed } from "./collect-keyed";
import { resource } from "./resource";
import type { ResourceState, KeyedResourceKey } from "@flurryx/core";
import type {
  StoreConfig,
  ResourceDef,
  InferEnum,
  InferData,
  ConfigToData,
  IStore,
} from "./types";

// ---------------------------------------------------------------------------
// Mirror definition — accumulated by builders, wired up in build() factory
// ---------------------------------------------------------------------------

interface MirrorDef {
  readonly sourceToken: InjectionToken<
    IStore<Record<string, ResourceState<unknown>>>
  >;
  readonly sourceKey: string;
  readonly targetKey: string;
}

function wireMirrors<
  TStore extends IStore<Record<string, ResourceState<unknown>>>,
>(store: TStore, mirrors: readonly MirrorDef[]): TStore {
  for (const def of mirrors) {
    const sourceStore = inject(def.sourceToken);
    mirrorKey(sourceStore, def.sourceKey, store, def.targetKey);
  }
  return store;
}

// ---------------------------------------------------------------------------
// MirrorKeyed definition — accumulated by builders, wired up in build()
// ---------------------------------------------------------------------------

interface MirrorKeyedDef {
  readonly sourceToken: InjectionToken<
    IStore<Record<string, ResourceState<unknown>>>
  >;
  readonly sourceKey: string;
  readonly targetKey: string;
  readonly extractId: (data: unknown) => KeyedResourceKey | undefined;
}

function wireMirrorKeyed<
  TStore extends IStore<Record<string, ResourceState<unknown>>>,
>(store: TStore, defs: readonly MirrorKeyedDef[]): TStore {
  for (const def of defs) {
    const sourceStore = inject(def.sourceToken);
    collectKeyed(sourceStore, def.sourceKey, store, def.targetKey, {
      extractId: def.extractId,
    });
  }
  return store;
}

interface SelfMirrorDef {
  readonly sourceKey: string;
  readonly targetKey: string;
}

const MIRROR_SELF_SAME_KEY_ERROR =
  "mirrorSelf source and target keys must be different";

function wireSelfMirrors<
  TStore extends IStore<Record<string, ResourceState<unknown>>>,
>(store: TStore, defs: readonly SelfMirrorDef[]): TStore {
  for (const def of defs) {
    if (def.sourceKey === def.targetKey) {
      throw new Error(MIRROR_SELF_SAME_KEY_ERROR);
    }

    mirrorKey(store, def.sourceKey, store, def.targetKey);
  }
  return store;
}

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
  mirror<TSourceData extends Record<string, ResourceState<unknown>>>(
    source: InjectionToken<IStore<TSourceData>>,
    sourceKey: keyof TSourceData & string,
    targetKey?: keyof TAccum & string,
  ): StoreBuilder<TAccum>;
  mirrorSelf(
    sourceKey: keyof TAccum & string,
    targetKey: keyof TAccum & string,
  ): StoreBuilder<TAccum>;
  mirrorKeyed<
    TSourceData extends Record<string, ResourceState<unknown>>,
    TEntity,
  >(
    source: InjectionToken<IStore<TSourceData>>,
    sourceKey: keyof TSourceData & string,
    options: {
      extractId: (data: TEntity | undefined) => KeyedResourceKey | undefined;
    },
    targetKey?: keyof TAccum & string,
  ): StoreBuilder<TAccum>;
  build(): InjectionToken<BaseStore<InferEnum<TAccum>, InferData<TAccum>>>;
}

function createBuilder<TAccum extends StoreConfig>(
  accum: TAccum,
  mirrors: readonly MirrorDef[] = [],
  mirrorKeyedDefs: readonly MirrorKeyedDef[] = [],
  selfMirrors: readonly SelfMirrorDef[] = [],
): StoreBuilder<TAccum> {
  return {
    resource<TKey extends string>(key: TKey): AsStep<TAccum, TKey> {
      return {
        as<T>(): StoreBuilder<TAccum & Record<TKey, ResourceDef<T>>> {
          const nextAccum = {
            ...accum,
            [key]: resource<T>(),
          } as TAccum & Record<TKey, ResourceDef<T>>;
          return createBuilder(
            nextAccum,
            mirrors,
            mirrorKeyedDefs,
            selfMirrors,
          );
        },
      };
    },
    mirror(source, sourceKey, targetKey?) {
      const def: MirrorDef = {
        sourceToken: source as InjectionToken<
          IStore<Record<string, ResourceState<unknown>>>
        >,
        sourceKey,
        targetKey: (targetKey ?? sourceKey) as string,
      };
      return createBuilder(
        accum,
        [...mirrors, def],
        mirrorKeyedDefs,
        selfMirrors,
      );
    },
    mirrorSelf(sourceKey, targetKey) {
      const def: SelfMirrorDef = {
        sourceKey,
        targetKey,
      };
      return createBuilder(accum, mirrors, mirrorKeyedDefs, [
        ...selfMirrors,
        def,
      ]);
    },
    mirrorKeyed(source, sourceKey, options, targetKey?) {
      const def: MirrorKeyedDef = {
        sourceToken: source as InjectionToken<
          IStore<Record<string, ResourceState<unknown>>>
        >,
        sourceKey,
        targetKey: (targetKey ?? sourceKey) as string,
        extractId: options.extractId as (
          data: unknown,
        ) => KeyedResourceKey | undefined,
      };
      return createBuilder(
        accum,
        mirrors,
        [...mirrorKeyedDefs, def],
        selfMirrors,
      );
    },
    build() {
      return new InjectionToken<
        BaseStore<InferEnum<TAccum>, InferData<TAccum>>
      >("FlurryxStore", {
        providedIn: "root",
        factory: () => {
          const store = new DynamicStore(accum);
          wireMirrors(store, mirrors);
          wireMirrorKeyed(store, mirrorKeyedDefs);
          wireSelfMirrors(store, selfMirrors);
          return store as BaseStore<InferEnum<TAccum>, InferData<TAccum>>;
        },
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
  TAccum extends StoreConfig,
> = Exclude<keyof TEnum & string, keyof TAccum>;

/** Intermediate .as<T>() step for the constrained builder. */
interface ConstrainedAsStep<
  TEnum extends Record<string, string>,
  TAccum extends StoreConfig,
  TKey extends string,
> {
  as<T>(): ConstrainedBuilder<TEnum, TAccum & Record<TKey, ResourceDef<T>>>;
}

/**
 * Constrained builder — only allows keys from the enum that haven't been
 * defined yet. `.build()` is only available when all keys are accounted for.
 */
type ConstrainedBuilder<
  TEnum extends Record<string, string>,
  TAccum extends StoreConfig,
> = [Remaining<TEnum, TAccum>] extends [never]
  ? {
      mirror<TSourceData extends Record<string, ResourceState<unknown>>>(
        source: InjectionToken<IStore<TSourceData>>,
        sourceKey: keyof TSourceData & string,
        targetKey?: keyof TAccum & string,
      ): ConstrainedBuilder<TEnum, TAccum>;
      mirrorSelf(
        sourceKey: keyof TAccum & string,
        targetKey: keyof TAccum & string,
      ): ConstrainedBuilder<TEnum, TAccum>;
      mirrorKeyed<
        TSourceData extends Record<string, ResourceState<unknown>>,
        TEntity,
      >(
        source: InjectionToken<IStore<TSourceData>>,
        sourceKey: keyof TSourceData & string,
        options: {
          extractId: (
            data: TEntity | undefined,
          ) => KeyedResourceKey | undefined;
        },
        targetKey?: keyof TAccum & string,
      ): ConstrainedBuilder<TEnum, TAccum>;
      build(): InjectionToken<BaseStore<InferEnum<TAccum>, InferData<TAccum>>>;
    }
  : {
      resource<TKey extends Remaining<TEnum, TAccum>>(
        key: TKey,
      ): ConstrainedAsStep<TEnum, TAccum, TKey>;
    };

function createConstrainedBuilder<
  TEnum extends Record<string, string>,
  TAccum extends StoreConfig,
>(
  _enumObj: TEnum,
  accum: TAccum,
  mirrors: readonly MirrorDef[] = [],
  mirrorKeyedDefs: readonly MirrorKeyedDef[] = [],
  selfMirrors: readonly SelfMirrorDef[] = [],
): ConstrainedBuilder<TEnum, TAccum> {
  return {
    resource<TKey extends string>(
      key: TKey,
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
          return createConstrainedBuilder(
            _enumObj,
            nextAccum,
            mirrors,
            mirrorKeyedDefs,
            selfMirrors,
          );
        },
      };
    },
    mirror(
      source: InjectionToken<IStore<Record<string, ResourceState<unknown>>>>,
      sourceKey: string,
      targetKey?: string,
    ) {
      const def: MirrorDef = {
        sourceToken: source,
        sourceKey,
        targetKey: targetKey ?? sourceKey,
      };
      return createConstrainedBuilder(
        _enumObj,
        accum,
        [...mirrors, def],
        mirrorKeyedDefs,
        selfMirrors,
      );
    },
    mirrorSelf(sourceKey: string, targetKey: string) {
      const def: SelfMirrorDef = {
        sourceKey,
        targetKey,
      };
      return createConstrainedBuilder(
        _enumObj,
        accum,
        mirrors,
        mirrorKeyedDefs,
        [...selfMirrors, def],
      );
    },
    mirrorKeyed(
      source: InjectionToken<IStore<Record<string, ResourceState<unknown>>>>,
      sourceKey: string,
      options: {
        extractId: (data: unknown) => KeyedResourceKey | undefined;
      },
      targetKey?: string,
    ) {
      const def: MirrorKeyedDef = {
        sourceToken: source,
        sourceKey,
        targetKey: targetKey ?? sourceKey,
        extractId: options.extractId,
      };
      return createConstrainedBuilder(
        _enumObj,
        accum,
        mirrors,
        [...mirrorKeyedDefs, def],
        selfMirrors,
      );
    },
    build() {
      return new InjectionToken<
        BaseStore<InferEnum<TAccum>, InferData<TAccum>>
      >("FlurryxStore", {
        providedIn: "root",
        factory: () => {
          const store = new DynamicStore(accum);
          wireMirrors(store, mirrors);
          wireMirrorKeyed(store, mirrorKeyedDefs);
          wireSelfMirrors(store, selfMirrors);
          return store as BaseStore<InferEnum<TAccum>, InferData<TAccum>>;
        },
      });
    },
  } as ConstrainedBuilder<TEnum, TAccum>;
}

// ---------------------------------------------------------------------------
// Interface-based builder (Store.for<Config>() API)
// ---------------------------------------------------------------------------

interface InterfaceBuilder<TConfig extends Record<string, unknown>> {
  mirror<TSourceData extends Record<string, ResourceState<unknown>>>(
    source: InjectionToken<IStore<TSourceData>>,
    sourceKey: keyof TSourceData & string,
    targetKey?: keyof TConfig & string,
  ): InterfaceBuilder<TConfig>;
  mirrorSelf(
    sourceKey: keyof TConfig & string,
    targetKey: keyof TConfig & string,
  ): InterfaceBuilder<TConfig>;
  mirrorKeyed<
    TSourceData extends Record<string, ResourceState<unknown>>,
    TEntity,
  >(
    source: InjectionToken<IStore<TSourceData>>,
    sourceKey: keyof TSourceData & string,
    options: {
      extractId: (data: TEntity | undefined) => KeyedResourceKey | undefined;
    },
    targetKey?: keyof TConfig & string,
  ): InterfaceBuilder<TConfig>;
  build(): InjectionToken<IStore<ConfigToData<TConfig>>>;
}

function createInterfaceBuilder<TConfig extends Record<string, unknown>>(
  mirrors: readonly MirrorDef[] = [],
  mirrorKeyedDefs: readonly MirrorKeyedDef[] = [],
  selfMirrors: readonly SelfMirrorDef[] = [],
): InterfaceBuilder<TConfig> {
  return {
    mirror(source, sourceKey, targetKey?) {
      const def: MirrorDef = {
        sourceToken: source as InjectionToken<
          IStore<Record<string, ResourceState<unknown>>>
        >,
        sourceKey,
        targetKey: (targetKey ?? sourceKey) as string,
      };
      return createInterfaceBuilder<TConfig>(
        [...mirrors, def],
        mirrorKeyedDefs,
        selfMirrors,
      );
    },
    mirrorSelf(sourceKey, targetKey) {
      const def: SelfMirrorDef = {
        sourceKey: sourceKey as string,
        targetKey: targetKey as string,
      };
      return createInterfaceBuilder<TConfig>(mirrors, mirrorKeyedDefs, [
        ...selfMirrors,
        def,
      ]);
    },
    mirrorKeyed(source, sourceKey, options, targetKey?) {
      const def: MirrorKeyedDef = {
        sourceToken: source as InjectionToken<
          IStore<Record<string, ResourceState<unknown>>>
        >,
        sourceKey,
        targetKey: (targetKey ?? sourceKey) as string,
        extractId: options.extractId as (
          data: unknown,
        ) => KeyedResourceKey | undefined,
      };
      return createInterfaceBuilder<TConfig>(
        mirrors,
        [...mirrorKeyedDefs, def],
        selfMirrors,
      );
    },
    build() {
      return new InjectionToken("FlurryxStore", {
        providedIn: "root",
        factory: () => {
          const store = new LazyStore() as IStore<
            Record<string, ResourceState<unknown>>
          >;
          wireMirrors(store, mirrors);
          wireMirrorKeyed(store, mirrorKeyedDefs);
          wireSelfMirrors(store, selfMirrors);
          return store as unknown as IStore<ConfigToData<TConfig>>;
        },
      });
    },
  };
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
    key: TKey,
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
  for<TConfig extends Record<string, unknown>>(): InterfaceBuilder<TConfig>;

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
    enumObj: TEnum,
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
      return createInterfaceBuilder();
    }
    return createConstrainedBuilder(enumObj!, {} as Record<string, never>);
  },
};
