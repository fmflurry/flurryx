import { describe, it, expect, vi, beforeEach } from "vitest";
import { of, throwError, Subject } from "rxjs";

vi.mock("@angular/core", async () => {
  return import("../__mocks__/@angular/core");
});

import { BaseStore } from "@flurryx/store";
import type { ResourceState } from "@flurryx/core";
import { syncToStore } from "../operators/sync-to-store";

enum TestEnum {
  DATA = "DATA",
}

interface TestData {
  [TestEnum.DATA]: ResourceState<string>;
}

class TestStore extends BaseStore<typeof TestEnum, TestData> {
  constructor() {
    super(TestEnum);
  }
}

describe("syncToStore", () => {
  let store: TestStore;

  beforeEach(() => {
    store = new TestStore();
  });

  it("should update store with data on success", () => {
    of("hello").pipe(syncToStore(store, TestEnum.DATA)).subscribe();

    const state = store.get(TestEnum.DATA)();
    expect(state.data).toBe("hello");
    expect(state.status).toBe("Success");
    expect(state.isLoading).toBe(false);
    expect(state.errors).toBeUndefined();
  });

  it("should update store with error on failure", () => {
    const error = { status: 500, message: "Server error" };
    throwError(() => error)
      .pipe(syncToStore(store, TestEnum.DATA))
      .subscribe({ error: () => {} });

    const state = store.get(TestEnum.DATA)();
    expect(state.status).toBe("Error");
    expect(state.isLoading).toBe(false);
    expect(state.errors).toEqual([{ code: "500", message: "Server error" }]);
  });

  it("should complete after first emission by default", () => {
    const subject = new Subject<string>();
    const next = vi.fn();
    const complete = vi.fn();

    subject
      .pipe(syncToStore(store, TestEnum.DATA))
      .subscribe({ next, complete });

    subject.next("first");
    subject.next("second");

    expect(next).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("should not complete after first emission when completeOnFirstEmission is false", () => {
    const subject = new Subject<string>();
    const next = vi.fn();

    subject
      .pipe(
        syncToStore(store, TestEnum.DATA, {
          completeOnFirstEmission: false,
        })
      )
      .subscribe({ next });

    subject.next("first");
    subject.next("second");

    expect(next).toHaveBeenCalledTimes(2);
  });

  it("should call callbackAfterComplete on finalize", () => {
    const callback = vi.fn();

    of("test")
      .pipe(
        syncToStore(store, TestEnum.DATA, {
          completeOnFirstEmission: true,
          callbackAfterComplete: callback,
        })
      )
      .subscribe();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should use custom error normalizer when provided", () => {
    const customNormalizer = vi
      .fn()
      .mockReturnValue([{ code: "CUSTOM", message: "custom error" }]);

    throwError(() => new Error("fail"))
      .pipe(
        syncToStore(store, TestEnum.DATA, {
          errorNormalizer: customNormalizer,
        })
      )
      .subscribe({ error: () => {} });

    expect(customNormalizer).toHaveBeenCalled();
    const state = store.get(TestEnum.DATA)();
    expect(state.errors).toEqual([{ code: "CUSTOM", message: "custom error" }]);
  });
});
