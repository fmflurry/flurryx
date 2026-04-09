import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@angular/core", async () => {
  return import("../__mocks__/@angular/core");
});

import { LazyStore, createInMemoryStoreMessageChannel } from "../index";
import type { ResourceState, KeyedResourceData } from "@flurryx/core";

interface TestEntity {
  id: string;
  name: string;
}

type TestData = {
  items: ResourceState<string[]>;
  count: ResourceState<number>;
  details: ResourceState<KeyedResourceData<string, TestEntity>>;
};

describe("LazyStore", () => {
  it("should expose public signal fields with lazy key registration", () => {
    const store = new LazyStore<TestData>();

    expect(store.history()).toHaveLength(1);
    expect(store.messages()).toEqual([]);
    expect(store.currentIndex()).toBe(0);
    expect(store.keys()).toEqual([]);

    store.get("items");
    expect(store.keys()).toEqual(["items"]);

    store.update("count", { data: 1, status: "Success" });
    expect(store.keys()).toEqual(["items", "count"]);
  });

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

  it("should update public history, messages, and currentIndex signals across updates and time travel", () => {
    const store = new LazyStore<TestData>();

    store.update("items", { data: ["a"], status: "Success" });
    store.update("count", { data: 2, status: "Success" });

    expect(store.history().map((entry) => entry.index)).toEqual([0, 1, 2]);
    expect(store.messages().map((record) => record.status)).toEqual([
      "acknowledged",
      "acknowledged",
    ]);
    expect(store.currentIndex()).toBe(2);

    store.restoreStoreAt(1);
    expect(store.currentIndex()).toBe(1);
    expect(store.get("items")().data).toEqual(["a"]);
    expect(store.get("count")().data).toBeUndefined();

    expect(store.undo()).toBe(true);
    expect(store.currentIndex()).toBe(0);

    expect(store.redo()).toBe(true);
    expect(store.currentIndex()).toBe(1);
    expect(store.get("items")().data).toEqual(["a"]);
  });

  it("should expose replay updates through public message and history signals", () => {
    const store = new LazyStore<TestData>();

    store.update("items", { data: ["a"], status: "Success" });
    const messageId = store.messages()[0]?.id;

    store.restoreStoreAt(0);

    expect(store.replay(messageId!)).toBe(1);
    expect(store.history()).toHaveLength(2);
    expect(store.currentIndex()).toBe(1);
    expect(store.messages()[0]?.status).toBe("acknowledged");
    expect(store.get("items")().data).toEqual(["a"]);
  });

  it("should expose dead-letter replay through public message and history signals", () => {
    const channel = createInMemoryStoreMessageChannel<TestData>();
    const pendingClearAll = channel.publish({ type: "clearAll" });
    const store = new LazyStore<TestData>({ channel });

    expect(store.messages()[0]?.status).toBe("pending");
    expect(store.replay(pendingClearAll.id)).toBe(0);
    expect(store.messages()[0]?.status).toBe("dead-letter");
    expect(store.history()).toHaveLength(1);
    expect(store.currentIndex()).toBe(0);

    store.get("items");

    expect(store.replayDeadLetter(pendingClearAll.id)).toBe(true);
    expect(store.messages()[0]?.status).toBe("acknowledged");
    expect(store.history()).toHaveLength(2);
    expect(store.currentIndex()).toBe(1);
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

  describe("onUpdate hook error isolation", () => {
    // Hook errors are deferred via queueMicrotask — suppress unhandled errors in tests
    let originalListeners: ((...args: unknown[]) => void)[];

    beforeEach(() => {
      originalListeners = process.rawListeners("uncaughtException") as ((
        ...args: unknown[]
      ) => void)[];
      process.removeAllListeners("uncaughtException");
      process.on("uncaughtException", () => {
        /* swallow in test */
      });
    });

    afterEach(() => {
      process.removeAllListeners("uncaughtException");
      originalListeners.forEach((listener) =>
        process.on("uncaughtException", listener)
      );
    });

    it("should call all hooks even when one throws", async () => {
      const store = new LazyStore<TestData>();
      const cb1 = vi.fn();
      const cb2 = vi.fn(() => {
        throw new Error("hook failed");
      });
      const cb3 = vi.fn();

      store.onUpdate("items", cb1);
      store.onUpdate("items", cb2);
      store.onUpdate("items", cb3);

      store.update("items", { data: ["x"] });

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
      expect(cb3).toHaveBeenCalledTimes(1);
      expect(store.get("items")().data).toEqual(["x"]);

      // Flush microtask queue so deferred throw doesn't leak
      await new Promise((r) => setTimeout(r, 0));
    });

    it("should call all hooks when multiple throw", async () => {
      const store = new LazyStore<TestData>();
      const cb1 = vi.fn(() => {
        throw new Error("first");
      });
      const cb2 = vi.fn();
      const cb3 = vi.fn(() => {
        throw new Error("second");
      });

      store.onUpdate("items", cb1);
      store.onUpdate("items", cb2);
      store.onUpdate("items", cb3);

      store.update("items", { data: ["x"] });

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
      expect(cb3).toHaveBeenCalledTimes(1);
      expect(store.get("items")().data).toEqual(["x"]);

      await new Promise((r) => setTimeout(r, 0));
    });
  });

  describe("keyed operations", () => {
    it("updateKeyedOne should add entity to keyed data", () => {
      const store = new LazyStore<TestData>();

      store.updateKeyedOne("details", "1", { id: "1", name: "Item 1" });

      const state = store.get("details")();
      const data = state.data as KeyedResourceData<string, TestEntity>;
      expect(data.entities["1"]).toEqual({ id: "1", name: "Item 1" });
      expect(data.isLoading["1"]).toBe(false);
      expect(data.status["1"]).toBe("Success");
      expect(state.isLoading).toBe(false);
    });

    it("updateKeyedOne should initialize keyed data when key has no data", () => {
      const store = new LazyStore<TestData>();

      store.updateKeyedOne("details", "a", { id: "a", name: "Alpha" });

      const state = store.get("details")();
      const data = state.data as KeyedResourceData<string, TestEntity>;
      expect(data.entities).toEqual({ a: { id: "a", name: "Alpha" } });
      expect(data.isLoading).toEqual({ a: false });
      expect(data.status).toEqual({ a: "Success" });
      expect(data.errors).toEqual({});
    });

    it("updateKeyedOne should clear previous errors for that key", () => {
      const store = new LazyStore<TestData>();

      store.updateKeyedOne("details", "1", { id: "1", name: "Item 1" });
      // Manually inject an error state
      const current = store.get("details")();
      const keyed = current.data as KeyedResourceData<string, TestEntity>;
      store.update("details", {
        data: {
          ...keyed,
          errors: { "1": [{ code: "E", message: "fail" }] },
        },
      } as Partial<TestData["details"]>);

      store.updateKeyedOne("details", "1", { id: "1", name: "Updated" });

      const state = store.get("details")();
      const data = state.data as KeyedResourceData<string, TestEntity>;
      expect(data.errors["1"]).toBeUndefined();
      expect(data.entities["1"]).toEqual({ id: "1", name: "Updated" });
    });

    it("clearKeyedOne should remove a single keyed entity", () => {
      const store = new LazyStore<TestData>();

      store.updateKeyedOne("details", "1", { id: "1", name: "Item 1" });
      store.updateKeyedOne("details", "2", { id: "2", name: "Item 2" });

      store.clearKeyedOne("details", "1");

      const state = store.get("details")();
      const data = state.data as KeyedResourceData<string, TestEntity>;
      expect(data.entities["1"]).toBeUndefined();
      expect(data.entities["2"]).toEqual({ id: "2", name: "Item 2" });
      expect(data.isLoading["1"]).toBeUndefined();
      expect(data.status["1"]).toBeUndefined();
      expect(data.errors["1"]).toBeUndefined();
    });

    it("clearKeyedOne should recalculate isLoading after removal", () => {
      const store = new LazyStore<TestData>();

      store.updateKeyedOne("details", "1", { id: "1", name: "Item 1" });
      store.startKeyedLoading("details", "2");

      // "2" is loading, "1" is not
      expect(store.get("details")().isLoading).toBe(true);

      // Remove the loading key
      store.clearKeyedOne("details", "2");

      expect(store.get("details")().isLoading).toBe(false);
    });

    it("clearKeyedOne should do nothing if data is not keyed", () => {
      const store = new LazyStore<TestData>();

      store.update("items", { data: ["plain"] });
      expect(() => store.clearKeyedOne("items", "key1")).not.toThrow();

      expect(store.get("items")().data).toEqual(["plain"]);
    });

    it("clearKeyedOne should notify update hooks", () => {
      const store = new LazyStore<TestData>();
      const cb = vi.fn();

      store.updateKeyedOne("details", "1", { id: "1", name: "Item 1" });

      store.onUpdate("details", cb);
      store.clearKeyedOne("details", "1");

      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("startKeyedLoading should set loading for a specific key", () => {
      const store = new LazyStore<TestData>();

      store.updateKeyedOne("details", "1", { id: "1", name: "Item 1" });
      store.startKeyedLoading("details", "2");

      const state = store.get("details")();
      const data = state.data as KeyedResourceData<string, TestEntity>;
      expect(data.isLoading["2"]).toBe(true);
      expect(data.isLoading["1"]).toBe(false);
      expect(state.isLoading).toBe(true);
    });

    it("startKeyedLoading should clear status and errors for that key", () => {
      const store = new LazyStore<TestData>();

      store.updateKeyedOne("details", "1", { id: "1", name: "Item 1" });
      store.startKeyedLoading("details", "1");

      const state = store.get("details")();
      const data = state.data as KeyedResourceData<string, TestEntity>;
      expect(data.status["1"]).toBeUndefined();
      expect(data.errors["1"]).toBeUndefined();
      expect(data.isLoading["1"]).toBe(true);
    });

    it("startKeyedLoading should fall back to startLoading if no keyed data", () => {
      const store = new LazyStore<TestData>();

      store.startKeyedLoading("items", "key1");

      const state = store.get("items")();
      expect(state.isLoading).toBe(true);
    });

    it("startKeyedLoading should notify update hooks", () => {
      const store = new LazyStore<TestData>();
      const cb = vi.fn();

      store.updateKeyedOne("details", "1", { id: "1", name: "Item 1" });
      store.onUpdate("details", cb);
      store.startKeyedLoading("details", "2");

      expect(cb).toHaveBeenCalledTimes(1);
    });
  });
});
