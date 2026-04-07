import { describe, expect, it, vi } from "vitest";

vi.mock("@angular/core", async () => {
  return import("../__mocks__/@angular/core");
});

vi.mock("@angular/common/http", () => ({
  HttpErrorResponse: class HttpErrorResponse extends Error {},
}));

import * as flurryx from "../index";
import * as flurryxHttp from "../http";
import {
  CACHE_NO_TIMEOUT,
  DEFAULT_CACHE_TTL_MS,
  createKeyedResourceData,
  isAnyKeyLoading,
  isKeyedResourceData,
} from "@flurryx/core";
import {
  BaseStore,
  LazyStore,
  Store,
  clearAllStores,
  cloneValue,
  collectKeyed,
  createCompositeStoreMessageChannel,
  createInMemoryStoreMessageChannel,
  createLocalStorageStoreMessageChannel,
  createSessionStorageStoreMessageChannel,
  createSnapshotRestorePatch,
  createStorageStoreMessageChannel,
  mirrorKey,
} from "@flurryx/store";
import {
  Loading,
  SkipIfCached,
  defaultErrorNormalizer,
  syncToKeyedStore,
  syncToStore,
} from "@flurryx/rx";
import { httpErrorNormalizer } from "@flurryx/rx/http";

function getNamedExport(
  moduleExports: object,
  exportName: string
): unknown {
  return (moduleExports as Record<string, unknown>)[exportName];
}

describe("flurryx public API", () => {
  it("re-exports the full runtime surface from core, store, and rx", () => {
    expect(getNamedExport(flurryx, "BaseStore")).toBe(BaseStore);
    expect(getNamedExport(flurryx, "LazyStore")).toBe(LazyStore);
    expect(getNamedExport(flurryx, "Store")).toBe(Store);
    expect(getNamedExport(flurryx, "clearAllStores")).toBe(clearAllStores);
    expect(getNamedExport(flurryx, "mirrorKey")).toBe(mirrorKey);
    expect(getNamedExport(flurryx, "collectKeyed")).toBe(collectKeyed);
    expect(getNamedExport(flurryx, "cloneValue")).toBe(cloneValue);
    expect(getNamedExport(flurryx, "createSnapshotRestorePatch")).toBe(
      createSnapshotRestorePatch
    );
    expect(getNamedExport(flurryx, "createInMemoryStoreMessageChannel")).toBe(
      createInMemoryStoreMessageChannel
    );
    expect(getNamedExport(flurryx, "createStorageStoreMessageChannel")).toBe(
      createStorageStoreMessageChannel
    );
    expect(
      getNamedExport(flurryx, "createLocalStorageStoreMessageChannel")
    ).toBe(createLocalStorageStoreMessageChannel);
    expect(
      getNamedExport(flurryx, "createSessionStorageStoreMessageChannel")
    ).toBe(createSessionStorageStoreMessageChannel);
    expect(getNamedExport(flurryx, "createCompositeStoreMessageChannel")).toBe(
      createCompositeStoreMessageChannel
    );
    expect(getNamedExport(flurryx, "syncToStore")).toBe(syncToStore);
    expect(getNamedExport(flurryx, "syncToKeyedStore")).toBe(syncToKeyedStore);
    expect(getNamedExport(flurryx, "SkipIfCached")).toBe(SkipIfCached);
    expect(getNamedExport(flurryx, "Loading")).toBe(Loading);
    expect(getNamedExport(flurryx, "defaultErrorNormalizer")).toBe(
      defaultErrorNormalizer
    );
    expect(getNamedExport(flurryx, "createKeyedResourceData")).toBe(
      createKeyedResourceData
    );
    expect(getNamedExport(flurryx, "isAnyKeyLoading")).toBe(isAnyKeyLoading);
    expect(getNamedExport(flurryx, "isKeyedResourceData")).toBe(
      isKeyedResourceData
    );
    expect(getNamedExport(flurryx, "CACHE_NO_TIMEOUT")).toBe(CACHE_NO_TIMEOUT);
    expect(getNamedExport(flurryx, "DEFAULT_CACHE_TTL_MS")).toBe(
      DEFAULT_CACHE_TTL_MS
    );
  });

  it("re-exports the HTTP normalizer entrypoint", () => {
    expect(flurryxHttp.httpErrorNormalizer).toBe(httpErrorNormalizer);
  });
});
