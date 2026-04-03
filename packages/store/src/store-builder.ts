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
  StoreDataShape,
  StoreKey,
} from "./types";

type AnyStoreData = Record<string, ResourceState<unknown>>;

// ---------------------------------------------------------------------------
// Mirror definition — accumulated by builders, wired up in build() factory
// ---------------------------------------------------------------------------

interface MirrorDef {
  readonly sourceToken: InjectionToken<IStore<AnyStoreData>>;
  readonly sourceKey: string;
  readonly targetKey: string;
}

function wireMirrors<
  TData extends StoreDataShape<TData>,
  TStore extends IStore<TData>
>(store: TStore, mirrors: readonly MirrorDef[]): TStore {
  for (const def of mirrors) {
    const sourceStore = inject(def.sourceToken);
    mirrorKey(
      sourceStore,
      def.sourceKey,
      store,
      def.targetKey as StoreKey<TData>
    );
  }
  return store;
}

// ---------------------------------------------------------------------------
// MirrorKeyed definition — accumulated by builders, wired up in build()
// ---------------------------------------------------------------------------

interface MirrorKeyedDef {
  readonly sourceToken: InjectionToken<IStore<AnyStoreData>>;
  readonly sourceKey: string;
  readonly targetKey: string;
  readonly extractId: (data: unknown) => KeyedResourceKey | undefined;
}

function wireMirrorKeyed<
  TData extends StoreDataShape<TData>,
  TStore extends IStore<TData>
>(store: TStore, defs: readonly MirrorKeyedDef[]): TStore {
  for (const def of defs) {
    const sourceStore = inject(def.sourceToken);
    collectKeyed(
      sourceStore,
      def.sourceKey,
      store,
      def.targetKey as StoreKey<TData>,
      {
        extractId: def.extractId,
      }
    );
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
  TData extends StoreDataShape<TData>,
  TStore extends IStore<TData>
>(store: TStore, defs: readonly SelfMirrorDef[]): TStore {
  for (const def of defs) {
    if (def.sourceKey === def.targetKey) {
      throw new Error(MIRROR_SELF_SAME_KEY_ERROR);
    }

    mirrorKey(
      store,
      def.sourceKey as StoreKey<TData>,
      store,
      def.targetKey as StoreKey<TData>
    );
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
 * Accumulates resource definitions then produces an `InjectionToken` on `.build()`.
 */
interface StoreBuilder<TAccum extends StoreConfig> {
  /** Define a new resource slot. Chain `.as<T>()` to set its type. */
  resource<TKey extends string>(key: TKey): AsStep<TAccum, TKey>;

  /**
   * Mirror a slot from another store. When the source updates, the target is kept in sync.
   *
   * @param source - The source store's `InjectionToken`.
   * @param sourceKey - The key to watch on the source store.
   * @param targetKey - The key on this store to write to. Defaults to `sourceKey`.
   */
  mirror<TSourceData extends StoreDataShape<TSourceData>>(
    source: InjectionToken<IStore<TSourceData>>,
    sourceKey: StoreKey<TSourceData>,
    targetKey?: StoreKey<TAccum>
  ): StoreBuilder<TAccum>;

  /**
   * Mirror one slot to another **within the same store**.
   * Source and target keys must be different.
   *
   * @param sourceKey - The slot to read from.
   * @param targetKey - The slot to write to.
   */
  mirrorSelf(
    sourceKey: StoreKey<TAccum>,
    targetKey: StoreKey<TAccum>
  ): StoreBuilder<TAccum>;

  /**
   * Accumulate single-entity fetches from a source store into a `KeyedResourceData` slot.
   *
   * @param source - The source store's `InjectionToken`.
   * @param sourceKey - The single-entity key on the source store.
   * @param options - Must include `extractId` to derive the entity's key from its data.
   * @param targetKey - The keyed slot on this store. Defaults to `sourceKey`.
   */
  mirrorKeyed<TSourceData extends StoreDataShape<TSourceData>, TEntity>(
    source: InjectionToken<IStore<TSourceData>>,
    sourceKey: StoreKey<TSourceData>,
    options: {
      extractId: (data: TEntity | undefined) => KeyedResourceKey | undefined;
    },
    targetKey?: StoreKey<TAccum>
  ): StoreBuilder<TAccum>;

  /**
   * Finalize the builder and create an `InjectionToken` (`providedIn: 'root'`).
   * All mirrors are wired up automatically when Angular creates the store.
   */
  build(): InjectionToken<BaseStore<InferEnum<TAccum>, InferData<TAccum>>>;
}

function createBuilder<TAccum extends StoreConfig>(
  accum: TAccum,
  mirrors: readonly MirrorDef[] = [],
  mirrorKeyedDefs: readonly MirrorKeyedDef[] = [],
  selfMirrors: readonly SelfMirrorDef[] = []
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
            selfMirrors
          );
        },
      };
    },
    mirror(source, sourceKey, targetKey?) {
      const def: MirrorDef = {
        sourceToken: source as InjectionToken<IStore<AnyStoreData>>,
        sourceKey,
        targetKey: targetKey ?? sourceKey,
      };
      return createBuilder(
        accum,
        [...mirrors, def],
        mirrorKeyedDefs,
        selfMirrors
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
        sourceToken: source as InjectionToken<IStore<AnyStoreData>>,
        sourceKey,
        targetKey: targetKey ?? sourceKey,
        extractId: options.extractId as (
          data: unknown
        ) => KeyedResourceKey | undefined,
      };
      return createBuilder(
        accum,
        mirrors,
        [...mirrorKeyedDefs, def],
        selfMirrors
      );
    },
    build() {
      return new InjectionToken<
        BaseStore<InferEnum<TAccum>, InferData<TAccum>>
      >("FlurryxStore", {
        providedIn: "root",
        factory: () => {
          const store = new DynamicStore(accum) as IStore<InferData<TAccum>>;
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
      mirror<TSourceData extends StoreDataShape<TSourceData>>(
        source: InjectionToken<IStore<TSourceData>>,
        sourceKey: StoreKey<TSourceData>,
        targetKey?: StoreKey<TAccum>
      ): ConstrainedBuilder<TEnum, TAccum>;
      mirrorSelf(
        sourceKey: StoreKey<TAccum>,
        targetKey: StoreKey<TAccum>
      ): ConstrainedBuilder<TEnum, TAccum>;
      mirrorKeyed<TSourceData extends StoreDataShape<TSourceData>, TEntity>(
        source: InjectionToken<IStore<TSourceData>>,
        sourceKey: StoreKey<TSourceData>,
        options: {
          extractId: (
            data: TEntity | undefined
          ) => KeyedResourceKey | undefined;
        },
        targetKey?: StoreKey<TAccum>
      ): ConstrainedBuilder<TEnum, TAccum>;
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
>(
  _enumObj: TEnum,
  accum: TAccum,
  mirrors: readonly MirrorDef[] = [],
  mirrorKeyedDefs: readonly MirrorKeyedDef[] = [],
  selfMirrors: readonly SelfMirrorDef[] = []
): ConstrainedBuilder<TEnum, TAccum> {
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
          return createConstrainedBuilder(
            _enumObj,
            nextAccum,
            mirrors,
            mirrorKeyedDefs,
            selfMirrors
          );
        },
      };
    },
    mirror(
      source: InjectionToken<IStore<AnyStoreData>>,
      sourceKey: string,
      targetKey?: string
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
        selfMirrors
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
        [...selfMirrors, def]
      );
    },
    mirrorKeyed(
      source: InjectionToken<IStore<AnyStoreData>>,
      sourceKey: string,
      options: {
        extractId: (data: unknown) => KeyedResourceKey | undefined;
      },
      targetKey?: string
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
        selfMirrors
      );
    },
    build() {
      return new InjectionToken<
        BaseStore<InferEnum<TAccum>, InferData<TAccum>>
      >("FlurryxStore", {
        providedIn: "root",
        factory: () => {
          const store = new DynamicStore(accum) as IStore<InferData<TAccum>>;
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

interface InterfaceBuilder<TConfig extends object> {
  mirror<TSourceData extends StoreDataShape<TSourceData>>(
    source: InjectionToken<IStore<TSourceData>>,
    sourceKey: StoreKey<TSourceData>,
    targetKey?: StoreKey<ConfigToData<TConfig>>
  ): InterfaceBuilder<TConfig>;
  mirrorSelf(
    sourceKey: StoreKey<ConfigToData<TConfig>>,
    targetKey: StoreKey<ConfigToData<TConfig>>
  ): InterfaceBuilder<TConfig>;
  mirrorKeyed<TSourceData extends StoreDataShape<TSourceData>, TEntity>(
    source: InjectionToken<IStore<TSourceData>>,
    sourceKey: StoreKey<TSourceData>,
    options: {
      extractId: (data: TEntity | undefined) => KeyedResourceKey | undefined;
    },
    targetKey?: StoreKey<ConfigToData<TConfig>>
  ): InterfaceBuilder<TConfig>;
  build(): InjectionToken<IStore<ConfigToData<TConfig>>>;
}

function createInterfaceBuilder<TConfig extends object>(
  mirrors: readonly MirrorDef[] = [],
  mirrorKeyedDefs: readonly MirrorKeyedDef[] = [],
  selfMirrors: readonly SelfMirrorDef[] = []
): InterfaceBuilder<TConfig> {
  return {
    mirror(source, sourceKey, targetKey?) {
      const def: MirrorDef = {
        sourceToken: source as InjectionToken<IStore<AnyStoreData>>,
        sourceKey,
        targetKey: targetKey ?? sourceKey,
      };
      return createInterfaceBuilder<TConfig>(
        [...mirrors, def],
        mirrorKeyedDefs,
        selfMirrors
      );
    },
    mirrorSelf(sourceKey, targetKey) {
      const def: SelfMirrorDef = {
        sourceKey,
        targetKey,
      };
      return createInterfaceBuilder<TConfig>(mirrors, mirrorKeyedDefs, [
        ...selfMirrors,
        def,
      ]);
    },
    mirrorKeyed(source, sourceKey, options, targetKey?) {
      const def: MirrorKeyedDef = {
        sourceToken: source as InjectionToken<IStore<AnyStoreData>>,
        sourceKey,
        targetKey: targetKey ?? sourceKey,
        extractId: options.extractId as (
          data: unknown
        ) => KeyedResourceKey | undefined,
      };
      return createInterfaceBuilder<TConfig>(
        mirrors,
        [...mirrorKeyedDefs, def],
        selfMirrors
      );
    },
    build() {
      return new InjectionToken("FlurryxStore", {
        providedIn: "root",
        factory: () => {
          const store = new LazyStore() as IStore<AnyStoreData>;
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
  for<TConfig extends object>(): InterfaceBuilder<TConfig>;

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
  ): ConstrainedBuilder<TEnum, Record<never, never>>;
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
  for: createStoreFor,
};

function createStoreFor<TConfig extends object>(): InterfaceBuilder<TConfig>;
function createStoreFor<TEnum extends Record<string, string>>(
  enumObj: TEnum
): ConstrainedBuilder<TEnum, Record<never, never>>;
function createStoreFor(enumObj?: Record<string, string>) {
  if (arguments.length === 0) {
    return createInterfaceBuilder();
  }

  return createConstrainedBuilder(enumObj!, {} as Record<never, never>);
}
