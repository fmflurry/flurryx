import type { ResourceState } from "@flurryx/core";
import type { IStore } from "./types";

export interface MirrorOptions {
  destroyRef?: { onDestroy: (fn: () => void) => void };
}

/**
 * Mirrors a resource key from a source store to a target store.
 * When the source key updates, the target key is updated with the same state.
 *
 * @param source - The store to mirror from
 * @param sourceKey - The key to watch on the source store
 * @param target - The store to mirror to
 * @param targetKeyOrOptions - Either the target key name or options (defaults source key)
 * @param options - Mirror options when a target key is provided
 * @returns Cleanup function to stop mirroring
 */
export function mirrorKey<
  TSource extends Record<string, ResourceState<unknown>>,
  TTarget extends Record<string, ResourceState<unknown>>
>(
  source: IStore<TSource>,
  sourceKey: keyof TSource & string,
  target: IStore<TTarget>,
  targetKeyOrOptions?: (keyof TTarget & string) | MirrorOptions,
  options?: MirrorOptions
): () => void {
  const resolvedTargetKey = (
    typeof targetKeyOrOptions === "string" ? targetKeyOrOptions : sourceKey
  ) as keyof TTarget & string;

  const resolvedOptions =
    typeof targetKeyOrOptions === "object" ? targetKeyOrOptions : options;

  const cleanup = source.onUpdate(sourceKey, (state) => {
    target.update(
      resolvedTargetKey,
      state as unknown as Partial<TTarget[keyof TTarget & string]>
    );
  });

  if (resolvedOptions?.destroyRef) {
    resolvedOptions.destroyRef.onDestroy(cleanup);
  }

  return cleanup;
}
