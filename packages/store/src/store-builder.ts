import { InjectionToken, inject } from "@angular/core";
import { BaseStore } from "./base-store";
import { DynamicStore } from "./dynamic-store";
import { LazyStore } from "./lazy-store";
import { deriveKey, type DeriveOptions } from "./derive-key";
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
  StoreOptions,
  StoreDataShape,
  StoreKey,
} from "./types";

type AnyStoreData = Record<string, ResourceState<unknown>>;

// ---------------------------------------------------------------------------
// Mirror definition — accumulated by builders, wired up in build() factory
// ---------------------------------------------------------------------------

interface MirrorDef {
  readonly sourceToken: InjectionToken<unknown>;
  readonly sourceKey: string;
  readonly targetKey: string;
}

function wireMirrors<TData extends StoreDataShape<TData>>(
  store: IStore<TData>,
  mirrors: readonly MirrorDef[]
): void {
  for (const def of mirrors) {
    const sourceStore = inject(def.sourceToken) as IStore<AnyStoreData>;
    mirrorKey(
      sourceStore,
      def.sourceKey as StoreKey<AnyStoreData>,
      store,
      def.targetKey as StoreKey<TData>
    );
  }
}

// ---------------------------------------------------------------------------
// MirrorKeyed definition — accumulated by builders, wired up in build()
// ---------------------------------------------------------------------------

interface MirrorKeyedDef {
  readonly sourceToken: InjectionToken<unknown>;
  readonly sourceKey: string;
  readonly targetKey: string;
  readonly extractId: (data: unknown) => KeyedResourceKey | undefined;
}

interface DeriveDef {
  readonly sourceToken: InjectionToken<unknown>;
  readonly sourceKey: string;
  readonly targetKey: string;
  readonly mapData: (data: unknown, state: ResourceState<unknown>) => unknown;
}

function wireMirrorKeyed<TData extends StoreDataShape<TData>>(
  store: IStore<TData>,
  defs: readonly MirrorKeyedDef[]
): void {
  for (const def of defs) {
    const sourceStore = inject(def.sourceToken) as IStore<AnyStoreData>;
    collectKeyed(
      sourceStore,
      def.sourceKey as StoreKey<AnyStoreData>,
      store,
      def.targetKey as StoreKey<TData>,
      {
        extractId: def.extractId,
      }
    );
  }
}

function wireDerives<TData extends StoreDataShape<TData>>(
  store: IStore<TData>,
  defs: readonly DeriveDef[]
): void {
  for (const def of defs) {
    const sourceStore = inject(def.sourceToken) as IStore<AnyStoreData>;
    const targetKey = def.targetKey as StoreKey<TData>;
    type TargetValue = TData[typeof targetKey] extends ResourceState<infer TValue>
      ? TValue
      : never;

    deriveKey(
      sourceStore,
      def.sourceKey as StoreKey<AnyStoreData>,
      store,
      targetKey,
      {
        mapData: (data, state) =>
          def.mapData(data, state as ResourceState<unknown>) as TargetValue,
      }
    );
  }
}

interface SelfMirrorDef {
  readonly sourceKey: string;
  readonly targetKey: string;
}

interface SelfDeriveDef {
  readonly sourceKey: string;
  readonly targetKey: string;
  readonly mapData: (data: unknown, state: ResourceState<unknown>) => unknown;
}

const MIRROR_SELF_SAME_KEY_ERROR =
  "mirrorSelf source and target keys must be different";

function wireSelfMirrors<TData extends StoreDataShape<TData>>(
  store: IStore<TData>,
  defs: readonly SelfMirrorDef[]
): void {
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
}

function wireSelfDerives<TData extends StoreDataShape<TData>>(
  store: IStore<TData>,
  defs: readonly SelfDeriveDef[]
): void {
  for (const def of defs) {
    if (def.sourceKey === def.targetKey) {
      throw new Error(MIRROR_SELF_SAME_KEY_ERROR);
    }

    const targetKey = def.targetKey as StoreKey<TData>;
    type TargetValue = TData[typeof targetKey] extends ResourceState<infer TValue>
      ? TValue
      : never;

    deriveKey(
      store,
      def.sourceKey as StoreKey<TData>,
      store,
      targetKey,
      {
        mapData: (data, state) =>
          def.mapData(data, state as ResourceState<unknown>) as TargetValue,
      }
    );
  }
}

type BuilderDeriveOptions<
  TSourceData extends StoreDataShape<TSourceData>,
  TSourceKey extends StoreKey<TSourceData>,
  TTargetValue,
> = Omit<DeriveOptions<TSourceData, TSourceKey, TTargetValue>, "destroyRef">;

// ---------------------------------------------------------------------------
// Unconstrained builder (existing API)
// ---------------------------------------------------------------------------

/**
 * Intermediate builder step after .resource('key') — awaits .as<T>().
 */
interface AsStep<TAccum extends StoreConfig, TKey extends string> {
  /**
   * Assign the resource value type for the previously declared key.
   *
   * Returns the main fluent builder so you can define more resources, configure
   * mirrors, or call `.build()`.
   *
   * @example
   * ```ts
   * const CustomersStore = Store
   *   .resource('CUSTOMERS').as<Customer[]>()
   *   .build();
   * ```
   */
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
   * Derive a slot from another store slot.
   * The target mirrors source loading/status/errors while `data` is mapped via `mapData`.
   */
  derive<
    TSourceData extends StoreDataShape<TSourceData>,
    TSourceKey extends StoreKey<TSourceData>,
    TTargetKey extends StoreKey<TAccum>,
  >(
    source: InjectionToken<IStore<TSourceData>>,
    sourceKey: TSourceKey,
    options: BuilderDeriveOptions<
      TSourceData,
      TSourceKey,
      InferData<TAccum>[TTargetKey] extends ResourceState<infer TValue>
        ? TValue
        : never
    >
  ): StoreBuilder<TAccum>;
  derive<
    TSourceData extends StoreDataShape<TSourceData>,
    TSourceKey extends StoreKey<TSourceData>,
    TTargetKey extends StoreKey<TAccum>,
  >(
    source: InjectionToken<IStore<TSourceData>>,
    sourceKey: TSourceKey,
    targetKey: TTargetKey,
    options: BuilderDeriveOptions<
      TSourceData,
      TSourceKey,
      InferData<TAccum>[TTargetKey] extends ResourceState<infer TValue>
        ? TValue
        : never
    >
  ): StoreBuilder<TAccum>;

  /**
   * Derive one slot from another slot within the same store.
   * Source and target keys must be different.
   */
  deriveSelf<
    TSourceKey extends StoreKey<TAccum>,
    TTargetKey extends StoreKey<TAccum>,
  >(
    sourceKey: TSourceKey,
    targetKey: TTargetKey,
    options: BuilderDeriveOptions<
      InferData<TAccum>,
      TSourceKey,
      InferData<TAccum>[TTargetKey] extends ResourceState<infer TValue>
        ? TValue
        : never
    >
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
  build(
    options?: StoreOptions<InferData<TAccum>>
  ): InjectionToken<BaseStore<InferEnum<TAccum>, InferData<TAccum>>>;
}

function createBuilder<TAccum extends StoreConfig>(
  accum: TAccum,
  mirrors: readonly MirrorDef[] = [],
  mirrorKeyedDefs: readonly MirrorKeyedDef[] = [],
  selfMirrors: readonly SelfMirrorDef[] = [],
  derives: readonly DeriveDef[] = [],
  selfDerives: readonly SelfDeriveDef[] = []
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
            derives,
            selfDerives
          );
        },
      };
    },
    mirror(source, sourceKey, targetKey?) {
      const def: MirrorDef = {
        sourceToken: source as InjectionToken<unknown>,
        sourceKey,
        targetKey: targetKey ?? sourceKey,
      };
      return createBuilder(
        accum,
        [...mirrors, def],
        mirrorKeyedDefs,
        selfMirrors,
        derives,
        selfDerives
      );
    },
    mirrorSelf(sourceKey, targetKey) {
      const def: SelfMirrorDef = {
        sourceKey,
        targetKey,
      };
      return createBuilder(
        accum,
        mirrors,
        mirrorKeyedDefs,
        [...selfMirrors, def],
        derives,
        selfDerives
      );
    },
    derive(source, sourceKey, targetKeyOrOptions, maybeOptions?) {
      const targetKey = (
        maybeOptions === undefined ? sourceKey : targetKeyOrOptions
      ) as string;
      const options = (
        maybeOptions === undefined ? targetKeyOrOptions : maybeOptions
      ) as BuilderDeriveOptions<AnyStoreData, StoreKey<AnyStoreData>, unknown>;

      const def: DeriveDef = {
        sourceToken: source as InjectionToken<unknown>,
        sourceKey,
        targetKey,
        mapData: options.mapData as (
          data: unknown,
          state: ResourceState<unknown>
        ) => unknown,
      };

      return createBuilder(
        accum,
        mirrors,
        mirrorKeyedDefs,
        selfMirrors,
        [...derives, def],
        selfDerives
      );
    },
    deriveSelf(sourceKey, targetKey, options) {
      const def: SelfDeriveDef = {
        sourceKey,
        targetKey,
        mapData: options.mapData as (
          data: unknown,
          state: ResourceState<unknown>
        ) => unknown,
      };

      return createBuilder(
        accum,
        mirrors,
        mirrorKeyedDefs,
        selfMirrors,
        derives,
        [...selfDerives, def]
      );
    },
    mirrorKeyed(source, sourceKey, options, targetKey?) {
      const def: MirrorKeyedDef = {
        sourceToken: source as InjectionToken<unknown>,
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
        selfMirrors,
        derives,
        selfDerives
      );
    },
    build(options?: StoreOptions<InferData<TAccum>>) {
      return new InjectionToken<
        BaseStore<InferEnum<TAccum>, InferData<TAccum>>
      >("FlurryxStore", {
        providedIn: "root",
        factory: () => {
          const store = new DynamicStore(accum, options) as IStore<InferData<TAccum>>;
          wireMirrors(store, mirrors);
          wireMirrorKeyed(store, mirrorKeyedDefs);
          wireSelfMirrors(store, selfMirrors);
          wireDerives(store, derives);
          wireSelfDerives(store, selfDerives);
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
  /**
   * Assign the resource value type for the selected enum key.
   *
   * Returns the constrained builder for the remaining enum keys.
   */
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
      ): ConstrainedBuilder<TEnum, TAccum>;
      /**
       * Mirror one slot to another within the same store.
       * Source and target keys must be different.
       *
       * @param sourceKey - The slot to read from.
       * @param targetKey - The slot to write to.
       */
      mirrorSelf(
        sourceKey: StoreKey<TAccum>,
        targetKey: StoreKey<TAccum>
      ): ConstrainedBuilder<TEnum, TAccum>;
      derive<
        TSourceData extends StoreDataShape<TSourceData>,
        TSourceKey extends StoreKey<TSourceData>,
        TTargetKey extends StoreKey<TAccum>,
      >(
        source: InjectionToken<IStore<TSourceData>>,
        sourceKey: TSourceKey,
        options: BuilderDeriveOptions<
          TSourceData,
          TSourceKey,
          InferData<TAccum>[TTargetKey] extends ResourceState<infer TValue>
            ? TValue
            : never
        >
      ): ConstrainedBuilder<TEnum, TAccum>;
      derive<
        TSourceData extends StoreDataShape<TSourceData>,
        TSourceKey extends StoreKey<TSourceData>,
        TTargetKey extends StoreKey<TAccum>,
      >(
        source: InjectionToken<IStore<TSourceData>>,
        sourceKey: TSourceKey,
        targetKey: TTargetKey,
        options: BuilderDeriveOptions<
          TSourceData,
          TSourceKey,
          InferData<TAccum>[TTargetKey] extends ResourceState<infer TValue>
            ? TValue
            : never
        >
      ): ConstrainedBuilder<TEnum, TAccum>;
      deriveSelf<
        TSourceKey extends StoreKey<TAccum>,
        TTargetKey extends StoreKey<TAccum>,
      >(
        sourceKey: TSourceKey,
        targetKey: TTargetKey,
        options: BuilderDeriveOptions<
          InferData<TAccum>,
          TSourceKey,
          InferData<TAccum>[TTargetKey] extends ResourceState<infer TValue>
            ? TValue
            : never
        >
      ): ConstrainedBuilder<TEnum, TAccum>;
      /**
       * Accumulate single-entity fetches from a source store into a keyed slot.
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
          extractId: (
            data: TEntity | undefined
          ) => KeyedResourceKey | undefined;
        },
        targetKey?: StoreKey<TAccum>
      ): ConstrainedBuilder<TEnum, TAccum>;
      /**
       * Finalize the builder and create an `InjectionToken` (`providedIn: 'root'`).
       * Available only after all enum keys have been defined.
       */
      build(
        options?: StoreOptions<InferData<TAccum>>
      ): InjectionToken<BaseStore<InferEnum<TAccum>, InferData<TAccum>>>;
    }
  : {
      /** Define the next resource slot from the remaining enum keys. */
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
  selfMirrors: readonly SelfMirrorDef[] = [],
  derives: readonly DeriveDef[] = [],
  selfDerives: readonly SelfDeriveDef[] = []
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
            selfMirrors,
            derives,
            selfDerives
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
        selfMirrors,
        derives,
        selfDerives
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
        derives,
        selfDerives
      );
    },
    derive(source, sourceKey, targetKeyOrOptions, maybeOptions?) {
      const targetKey = (
        maybeOptions === undefined ? sourceKey : targetKeyOrOptions
      ) as string;
      const options = (
        maybeOptions === undefined ? targetKeyOrOptions : maybeOptions
      ) as BuilderDeriveOptions<AnyStoreData, StoreKey<AnyStoreData>, unknown>;

      const def: DeriveDef = {
        sourceToken: source,
        sourceKey,
        targetKey,
        mapData: options.mapData as (
          data: unknown,
          state: ResourceState<unknown>
        ) => unknown,
      };

      return createConstrainedBuilder(
        _enumObj,
        accum,
        mirrors,
        mirrorKeyedDefs,
        selfMirrors,
        [...derives, def],
        selfDerives
      );
    },
    deriveSelf(sourceKey: string, targetKey: string, options) {
      const def: SelfDeriveDef = {
        sourceKey,
        targetKey,
        mapData: options.mapData as (
          data: unknown,
          state: ResourceState<unknown>
        ) => unknown,
      };

      return createConstrainedBuilder(
        _enumObj,
        accum,
        mirrors,
        mirrorKeyedDefs,
        selfMirrors,
        derives,
        [...selfDerives, def]
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
        selfMirrors,
        derives,
        selfDerives
      );
    },
    build(options?: StoreOptions<InferData<TAccum>>) {
      return new InjectionToken<
        BaseStore<InferEnum<TAccum>, InferData<TAccum>>
      >("FlurryxStore", {
        providedIn: "root",
        factory: () => {
          const store = new DynamicStore(accum, options) as IStore<InferData<TAccum>>;
          wireMirrors(store, mirrors);
          wireMirrorKeyed(store, mirrorKeyedDefs);
          wireSelfMirrors(store, selfMirrors);
          wireDerives(store, derives);
          wireSelfDerives(store, selfDerives);
          return store as BaseStore<InferEnum<TAccum>, InferData<TAccum>>;
        },
      });
    },
  } as ConstrainedBuilder<TEnum, TAccum>;
}

// ---------------------------------------------------------------------------
// Interface-based builder (Store.for<Config>() API)
// ---------------------------------------------------------------------------

/**
 * Interface-based builder for `Store.for<Config>()`.
 *
 * Uses a config interface for compile-time shape only, so no runtime enum is required.
 */
interface InterfaceBuilder<TConfig extends object> {
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
    targetKey?: StoreKey<ConfigToData<TConfig>>
  ): InterfaceBuilder<TConfig>;
  /**
   * Mirror one slot to another within the same store.
   * Source and target keys must be different.
   *
   * @param sourceKey - The slot to read from.
   * @param targetKey - The slot to write to.
   */
  mirrorSelf(
    sourceKey: StoreKey<ConfigToData<TConfig>>,
    targetKey: StoreKey<ConfigToData<TConfig>>
  ): InterfaceBuilder<TConfig>;
  derive<
    TSourceData extends StoreDataShape<TSourceData>,
    TSourceKey extends StoreKey<TSourceData>,
    TTargetKey extends StoreKey<ConfigToData<TConfig>>,
  >(
    source: InjectionToken<IStore<TSourceData>>,
    sourceKey: TSourceKey,
    options: BuilderDeriveOptions<
      TSourceData,
      TSourceKey,
      ConfigToData<TConfig>[TTargetKey] extends ResourceState<infer TValue>
        ? TValue
        : never
    >
  ): InterfaceBuilder<TConfig>;
  derive<
    TSourceData extends StoreDataShape<TSourceData>,
    TSourceKey extends StoreKey<TSourceData>,
    TTargetKey extends StoreKey<ConfigToData<TConfig>>,
  >(
    source: InjectionToken<IStore<TSourceData>>,
    sourceKey: TSourceKey,
    targetKey: TTargetKey,
    options: BuilderDeriveOptions<
      TSourceData,
      TSourceKey,
      ConfigToData<TConfig>[TTargetKey] extends ResourceState<infer TValue>
        ? TValue
        : never
    >
  ): InterfaceBuilder<TConfig>;
  deriveSelf<
    TSourceKey extends StoreKey<ConfigToData<TConfig>>,
    TTargetKey extends StoreKey<ConfigToData<TConfig>>,
  >(
    sourceKey: TSourceKey,
    targetKey: TTargetKey,
    options: BuilderDeriveOptions<
      ConfigToData<TConfig>,
      TSourceKey,
      ConfigToData<TConfig>[TTargetKey] extends ResourceState<infer TValue>
        ? TValue
        : never
    >
  ): InterfaceBuilder<TConfig>;
  /**
   * Accumulate single-entity fetches from a source store into a keyed slot.
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
    targetKey?: StoreKey<ConfigToData<TConfig>>
  ): InterfaceBuilder<TConfig>;
  /**
   * Finalize the interface-based builder and create a store `InjectionToken`.
   *
   * The resulting token is registered with `providedIn: 'root'` and resolves to
   * a `LazyStore` implementing `IStore<ConfigToData<TConfig>>`.
   *
   * @returns An Angular `InjectionToken` for the configured store.
   *
   * @example
   * ```ts
   * interface ChatStoreConfig {
   *   SESSIONS: ChatSession[];
   *   MESSAGES: ChatMessage[];
   * }
   *
   * export const ChatStore = Store.for<ChatStoreConfig>().build();
   * ```
   */
  build(
    options?: StoreOptions<ConfigToData<TConfig>>
  ): InjectionToken<IStore<ConfigToData<TConfig>>>;
}

function createInterfaceBuilder<TConfig extends object>(
  mirrors: readonly MirrorDef[] = [],
  mirrorKeyedDefs: readonly MirrorKeyedDef[] = [],
  selfMirrors: readonly SelfMirrorDef[] = [],
  derives: readonly DeriveDef[] = [],
  selfDerives: readonly SelfDeriveDef[] = []
): InterfaceBuilder<TConfig> {
  return {
    mirror(source, sourceKey, targetKey?) {
      const def: MirrorDef = {
        sourceToken: source as InjectionToken<unknown>,
        sourceKey,
        targetKey: targetKey ?? sourceKey,
      };
      return createInterfaceBuilder<TConfig>(
        [...mirrors, def],
        mirrorKeyedDefs,
        selfMirrors,
        derives,
        selfDerives
      );
    },
    mirrorSelf(sourceKey, targetKey) {
      const def: SelfMirrorDef = {
        sourceKey,
        targetKey,
      };
      return createInterfaceBuilder<TConfig>(
        mirrors,
        mirrorKeyedDefs,
        [...selfMirrors, def],
        derives,
        selfDerives
      );
    },
    derive(source, sourceKey, targetKeyOrOptions, maybeOptions?) {
      const targetKey = (
        maybeOptions === undefined ? sourceKey : targetKeyOrOptions
      ) as string;
      const options = (
        maybeOptions === undefined ? targetKeyOrOptions : maybeOptions
      ) as BuilderDeriveOptions<AnyStoreData, StoreKey<AnyStoreData>, unknown>;

      const def: DeriveDef = {
        sourceToken: source as InjectionToken<unknown>,
        sourceKey,
        targetKey,
        mapData: options.mapData as (
          data: unknown,
          state: ResourceState<unknown>
        ) => unknown,
      };

      return createInterfaceBuilder<TConfig>(
        mirrors,
        mirrorKeyedDefs,
        selfMirrors,
        [...derives, def],
        selfDerives
      );
    },
    deriveSelf(sourceKey, targetKey, options) {
      const def: SelfDeriveDef = {
        sourceKey,
        targetKey,
        mapData: options.mapData as (
          data: unknown,
          state: ResourceState<unknown>
        ) => unknown,
      };

      return createInterfaceBuilder<TConfig>(
        mirrors,
        mirrorKeyedDefs,
        selfMirrors,
        derives,
        [...selfDerives, def]
      );
    },
    mirrorKeyed(source, sourceKey, options, targetKey?) {
      const def: MirrorKeyedDef = {
        sourceToken: source as InjectionToken<unknown>,
        sourceKey,
        targetKey: targetKey ?? sourceKey,
        extractId: options.extractId as (
          data: unknown
        ) => KeyedResourceKey | undefined,
      };
      return createInterfaceBuilder<TConfig>(
        mirrors,
        [...mirrorKeyedDefs, def],
        selfMirrors,
        derives,
        selfDerives
      );
    },
    build(options?: StoreOptions<ConfigToData<TConfig>>) {
      return new InjectionToken("FlurryxStore", {
        providedIn: "root",
        factory: () => {
          const store = new LazyStore(options) as unknown as IStore<AnyStoreData>;
          wireMirrors(store, mirrors);
          wireMirrorKeyed(store, mirrorKeyedDefs);
          wireSelfMirrors(store, selfMirrors);
          wireDerives(store, derives);
          wireSelfDerives(store, selfDerives);
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
    /**
     * Set the resource value type and continue the fluent builder chain.
     *
     * @example
     * ```ts
     * const UsersStore = Store
     *   .resource('USERS').as<User[]>()
     *   .build();
     * ```
     */
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
