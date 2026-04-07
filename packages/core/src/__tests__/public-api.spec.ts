import { describe, expect, it } from "vitest";

import * as core from "../index";
import {
  createKeyedResourceData,
  isAnyKeyLoading,
  isKeyedResourceData,
} from "../keyed-resource";
import { CACHE_NO_TIMEOUT, DEFAULT_CACHE_TTL_MS } from "../constants";

describe("@flurryx/core public API", () => {
  it("re-exports keyed resource helpers", () => {
    expect(core.createKeyedResourceData).toBe(createKeyedResourceData);
    expect(core.isAnyKeyLoading).toBe(isAnyKeyLoading);
    expect(core.isKeyedResourceData).toBe(isKeyedResourceData);
  });

  it("re-exports cache constants", () => {
    expect(core.CACHE_NO_TIMEOUT).toBe(CACHE_NO_TIMEOUT);
    expect(core.DEFAULT_CACHE_TTL_MS).toBe(DEFAULT_CACHE_TTL_MS);
  });
});
