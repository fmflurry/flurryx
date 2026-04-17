import { computed, isSignal, signal } from "@angular/core";
import { describe, expect, it } from "vitest";
import type { KeyedResourceData, ResourceState } from "@flurryx/core";
import { BaseStore, LazyStore } from "../index";

enum TestStoreEnum {
  ITEM = "ITEM",
  DETAILS = "DETAILS",
}

interface BaseStoreData {
  [TestStoreEnum.ITEM]: ResourceState<string>;
  [TestStoreEnum.DETAILS]: ResourceState<
    KeyedResourceData<string, { id: string; name: string }>
  >;
}

class TestStore extends BaseStore<typeof TestStoreEnum, BaseStoreData> {
  constructor() {
    super(TestStoreEnum);
  }
}

interface LazyStoreData {
  item: ResourceState<string>;
  details: ResourceState<KeyedResourceData<string, { id: string; name: string }>>;
}

describe("store signal Angular interop", () => {
  it("BaseStore get() and .for() should return Angular signals", () => {
    const store = new TestStore();
    const resourceKey = signal("1");

    const itemSignal = store.get(TestStoreEnum.ITEM);
    const detailSignal = store.get(TestStoreEnum.DETAILS).for(resourceKey);
    const detailState = computed(() => detailSignal());

    expect(isSignal(itemSignal)).toBe(true);
    expect(isSignal(detailSignal)).toBe(true);
    expect(detailState()).toEqual({
      data: undefined,
      isLoading: false,
      status: undefined,
      errors: undefined,
    });
  });

  it("LazyStore get() and .for() should return Angular signals", () => {
    const store = new LazyStore<LazyStoreData>();
    const resourceKey = signal("1");

    const itemSignal = store.get("item");
    const detailSignal = store.get("details").for(resourceKey);
    const detailState = computed(() => detailSignal());

    expect(isSignal(itemSignal)).toBe(true);
    expect(isSignal(detailSignal)).toBe(true);
    expect(detailState()).toEqual({
      data: undefined,
      isLoading: false,
      status: undefined,
      errors: undefined,
    });
  });
});
