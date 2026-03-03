import { describe, it, expect, vi } from "vitest";

vi.mock("@angular/core", async () => {
  return import("../__mocks__/@angular/core");
});

import { LazyStore } from "../lazy-store";
import type { ResourceState } from "@flurryx/core";

type TestData = {
  items: ResourceState<string[]>;
  count: ResourceState<number>;
};

describe("LazyStore", () => {
  it("should lazily create signals with default state on first get()", () => {
    const store = new LazyStore<TestData>();
    const sig = store.get("items");

    expect(sig).toBeDefined();
    expect(sig().isLoading).toBe(false);
    expect(sig().data).toBeUndefined();
    expect(sig().status).toBeUndefined();
    expect(sig().errors).toBeUndefined();
  });

  it("should return the same signal instance for repeated get() calls", () => {
    const store = new LazyStore<TestData>();
    const sig1 = store.get("items");
    const sig2 = store.get("items");

    expect(sig1).toBe(sig2);
  });

  it("should update state for a key", () => {
    const store = new LazyStore<TestData>();

    store.update("items", { data: ["a", "b"], status: "Success" });

    const state = store.get("items")();
    expect(state.data).toEqual(["a", "b"]);
    expect(state.status).toBe("Success");
  });

  it("should merge partial updates into existing state", () => {
    const store = new LazyStore<TestData>();

    store.update("count", { data: 10, isLoading: true });
    store.update("count", { isLoading: false });

    const state = store.get("count")();
    expect(state.data).toBe(10);
    expect(state.isLoading).toBe(false);
  });

  it("should clear a specific key back to default state", () => {
    const store = new LazyStore<TestData>();

    store.update("items", { data: ["x"], status: "Success" });
    store.clear("items");

    const state = store.get("items")();
    expect(state.data).toBeUndefined();
    expect(state.isLoading).toBe(false);
    expect(state.status).toBeUndefined();
  });

  it("should clearAll only reset accessed keys", () => {
    const store = new LazyStore<TestData>();

    store.update("items", { data: ["a"] });
    store.update("count", { data: 5 });

    store.clearAll();

    expect(store.get("items")().data).toBeUndefined();
    expect(store.get("count")().data).toBeUndefined();
  });

  it("should startLoading set isLoading to true", () => {
    const store = new LazyStore<TestData>();

    store.startLoading("items");

    expect(store.get("items")().isLoading).toBe(true);
  });

  it("should stopLoading set isLoading to false", () => {
    const store = new LazyStore<TestData>();

    store.startLoading("count");
    store.stopLoading("count");

    expect(store.get("count")().isLoading).toBe(false);
  });

  it("should notify onUpdate callbacks when state changes", () => {
    const store = new LazyStore<TestData>();
    const callback = vi.fn();

    store.onUpdate("items", callback);
    store.update("items", { data: ["test"] });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ data: ["test"] }),
      expect.objectContaining({ data: undefined })
    );
  });

  it("should stop notifying after cleanup function is called", () => {
    const store = new LazyStore<TestData>();
    const callback = vi.fn();

    const cleanup = store.onUpdate("items", callback);
    store.update("items", { data: ["first"] });
    expect(callback).toHaveBeenCalledTimes(1);

    cleanup();
    store.update("items", { data: ["second"] });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should notify onUpdate on clear()", () => {
    const store = new LazyStore<TestData>();
    const callback = vi.fn();

    store.update("count", { data: 42 });
    store.onUpdate("count", callback);
    store.clear("count");

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ data: undefined }),
      expect.objectContaining({ data: 42 })
    );
  });

  it("should support multiple callbacks for the same key", () => {
    const store = new LazyStore<TestData>();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    store.onUpdate("items", cb1);
    store.onUpdate("items", cb2);
    store.update("items", { data: ["x"] });

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });
});
