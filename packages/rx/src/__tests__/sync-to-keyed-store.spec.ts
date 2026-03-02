import { describe, it, expect, vi, beforeEach } from "vitest";
import { of, throwError } from "rxjs";

vi.mock("@angular/core", async () => {
  return import("../__mocks__/@angular/core");
});

import { BaseStore } from "@flurryx/store";
import type { ResourceState, KeyedResourceData } from "@flurryx/core";
import { createKeyedResourceData } from "@flurryx/core";
import { syncToKeyedStore } from "../operators/sync-to-keyed-store";

enum TestEnum {
  ITEMS = "ITEMS",
}

interface TestData {
  [TestEnum.ITEMS]: ResourceState<
    KeyedResourceData<string, { id: string; name: string }>
  >;
}

class TestStore extends BaseStore<typeof TestEnum, TestData> {
  constructor() {
    super(TestEnum);
  }
}

describe("syncToKeyedStore", () => {
  let store: TestStore;

  beforeEach(() => {
    store = new TestStore();
    store.update(TestEnum.ITEMS, {
      data: createKeyedResourceData<string, { id: string; name: string }>(),
    });
  });

  it("should update keyed store on success", () => {
    const entity = { id: "1", name: "Item 1" };

    of(entity).pipe(syncToKeyedStore(store, TestEnum.ITEMS, "1")).subscribe();

    const state = store.get(TestEnum.ITEMS)();
    const data = state.data as KeyedResourceData<
      string,
      { id: string; name: string }
    >;
    expect(data.entities["1"]).toEqual(entity);
    expect(data.isLoading["1"]).toBe(false);
    expect(data.status["1"]).toBe("Success");
    expect(state.isLoading).toBe(false);
  });

  it("should update keyed store on error", () => {
    const error = { status: 404, message: "Not found" };

    throwError(() => error)
      .pipe(syncToKeyedStore(store, TestEnum.ITEMS, "missing"))
      .subscribe({ error: () => {} });

    const state = store.get(TestEnum.ITEMS)();
    const data = state.data as KeyedResourceData<
      string,
      { id: string; name: string }
    >;
    expect(data.status["missing"]).toBe("Error");
    expect(data.isLoading["missing"]).toBe(false);
    expect(data.errors["missing"]).toEqual([
      { code: "404", message: "Not found" },
    ]);
  });

  it("should use mapResponse to transform data", () => {
    const response = { data: { id: "2", name: "Mapped" } };

    of(response)
      .pipe(
        syncToKeyedStore(store, TestEnum.ITEMS, "2", {
          mapResponse: (r: typeof response) => r.data,
        })
      )
      .subscribe();

    const state = store.get(TestEnum.ITEMS)();
    const data = state.data as KeyedResourceData<
      string,
      { id: string; name: string }
    >;
    expect(data.entities["2"]).toEqual({ id: "2", name: "Mapped" });
  });

  it("should initialize keyed data if store data is undefined", () => {
    store.clear(TestEnum.ITEMS);

    of({ id: "1", name: "First" })
      .pipe(syncToKeyedStore(store, TestEnum.ITEMS, "1"))
      .subscribe();

    const state = store.get(TestEnum.ITEMS)();
    const data = state.data as KeyedResourceData<
      string,
      { id: string; name: string }
    >;
    expect(data.entities["1"]).toEqual({ id: "1", name: "First" });
  });

  it("should call callbackAfterComplete on finalize", () => {
    const callback = vi.fn();

    of({ id: "1", name: "Test" })
      .pipe(
        syncToKeyedStore(store, TestEnum.ITEMS, "1", {
          completeOnFirstEmission: true,
          callbackAfterComplete: callback,
        })
      )
      .subscribe();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should use custom error normalizer", () => {
    const customNormalizer = vi
      .fn()
      .mockReturnValue([{ code: "KEYED_ERR", message: "keyed error" }]);

    throwError(() => new Error("fail"))
      .pipe(
        syncToKeyedStore(store, TestEnum.ITEMS, "k1", {
          errorNormalizer: customNormalizer,
        })
      )
      .subscribe({ error: () => {} });

    expect(customNormalizer).toHaveBeenCalled();
    const state = store.get(TestEnum.ITEMS)();
    const data = state.data as KeyedResourceData<
      string,
      { id: string; name: string }
    >;
    expect(data.errors["k1"]).toEqual([
      { code: "KEYED_ERR", message: "keyed error" },
    ]);
  });
});
