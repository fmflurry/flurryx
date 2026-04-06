import { BaseStore } from './base-store';
import type { StoreConfig, InferEnum, InferData, StoreOptions } from './types';

/**
 * Internal concrete subclass of BaseStore.
 * Auto-generates an identity enum from config keys.
 * NOT publicly exported — consumers interact via BaseStore interface.
 */
export class DynamicStore<
  TConfig extends StoreConfig,
> extends BaseStore<InferEnum<TConfig>, InferData<TConfig>> {
  constructor(config: TConfig, options?: StoreOptions<InferData<TConfig>>) {
    const identityEnum = Object.keys(config).reduce(
      (acc, key) => ({ ...acc, [key]: key }),
      {} as InferEnum<TConfig>
    );
    super(identityEnum, options);
  }
}
