import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@angular/core", async () => {
  return import("../__mocks__/@angular/core");
});

import { BaseStore, createInMemoryStoreMessageChannel } from "../index";
import type { ResourceState, KeyedResourceData } from "@flurryx/core";
import { computed, signal } from "@angular/core";

enum TestStoreEnum {
  ITEM_ONE = "ITEM_ONE",
  ITEM_TWO = "ITEM_TWO",
  ITEM_THREE = "ITEM_THREE",
}

interface TestData {
  [TestStoreEnum.ITEM_ONE]: ResourceState<string>;
  [TestStoreEnum.ITEM_TWO]: ResourceState<number>;
  [TestStoreEnum.ITEM_THREE]: ResourceState<
    KeyedResourceData<string, { id: string; name: string }>
  >;
}

class TestStore extends BaseStore<typeof TestStoreEnum, TestData> {
  constructor() {
    super(TestStoreEnum);
  }
}

class TestStoreWithChannel extends BaseStore<typeof TestStoreEnum, TestData> {
  constructor(channel: ReturnType<typeof createInMemoryStoreMessageChannel<TestData>>) {
    super(TestStoreEnum, { channel });
  }
}

describe("BaseStore", () => {
  let store: TestStore;

  beforeEach(() => {
    store = new TestStore();
  });

  it("should create the store", () => {
    expect(store).toBeTruthy();
  });

  describe("initialization", () => {
    it("should initialize state with default values for all enum keys", () => {
      Object.values(TestStoreEnum).forEach((key) => {
        const sig = store.get(key);
        expect(sig).toBeDefined();
        const state = sig();
        expect(state.isLoading).toBe(false);
        expect(state.data).toBeUndefined();
        expect(state.status).toBeUndefined();
        expect(state.errors).toBeUndefined();
      });
    });

    it("should expose public signal fields for history, messages, currentIndex, and keys", () => {
      expect(store.history()).toHaveLength(1);
      expect(store.messages()).toEqual([]);
      expect(store.currentIndex()).toBe(0);
      expect(store.keys()).toEqual(Object.values(TestStoreEnum));
    });
  });

  describe("public signal contract", () => {
    it("should update history, messages, and currentIndex signals across updates and time travel", () => {
      store.update(TestStoreEnum.ITEM_ONE, { data: "one", status: "Success" });
      store.update(TestStoreEnum.ITEM_TWO, { data: 2, status: "Success" });

      expect(store.history().map((entry) => entry.index)).toEqual([0, 1, 2]);
      expect(store.messages().map((record) => record.status)).toEqual([
        "acknowledged",
        "acknowledged",
      ]);
      expect(store.currentIndex()).toBe(2);

      store.restoreStoreAt(1);
      expect(store.currentIndex()).toBe(1);
      expect(store.get(TestStoreEnum.ITEM_ONE)().data).toBe("one");
      expect(store.get(TestStoreEnum.ITEM_TWO)().data).toBeUndefined();

      expect(store.undo()).toBe(true);
      expect(store.currentIndex()).toBe(0);
      expect(store.get(TestStoreEnum.ITEM_ONE)().data).toBeUndefined();

      expect(store.redo()).toBe(true);
      expect(store.currentIndex()).toBe(1);
      expect(store.get(TestStoreEnum.ITEM_ONE)().data).toBe("one");
    });

    it("should expose replay updates through public message and history signals", () => {
      store.update(TestStoreEnum.ITEM_ONE, { data: "one", status: "Success" });
      const messageId = store.messages()[0]?.id;

      store.restoreStoreAt(0);

      expect(store.replay(messageId!)).toBe(1);
      expect(store.history()).toHaveLength(2);
      expect(store.currentIndex()).toBe(1);
      expect(store.messages()[0]?.status).toBe("acknowledged");
      expect(store.get(TestStoreEnum.ITEM_ONE)().data).toBe("one");
    });

    it("should expose failed dead-letter replay attempts through public message and history signals", () => {
      const channel = createInMemoryStoreMessageChannel<TestData>();
      const pendingInvalidClear = channel.publish({
        type: "clear",
        key: "INVALID" as TestStoreEnum,
      });
      const failingStore = new TestStoreWithChannel(channel);

      expect(failingStore.messages()[0]?.status).toBe("pending");
      expect(failingStore.replay(pendingInvalidClear.id)).toBe(0);
      expect(failingStore.messages()[0]?.status).toBe("dead-letter");
      expect(failingStore.history()).toHaveLength(1);
      expect(failingStore.currentIndex()).toBe(0);

      expect(failingStore.replayDeadLetter(pendingInvalidClear.id)).toBe(false);
      expect(failingStore.messages()[0]?.status).toBe("dead-letter");
      expect(failingStore.messages()[0]?.attempts).toBe(2);
      expect(failingStore.history()).toHaveLength(1);
      expect(failingStore.currentIndex()).toBe(0);
    });
  });

  describe("get", () => {
    it("should return the signal for a valid key", () => {
      const sig = store.get(TestStoreEnum.ITEM_ONE);
      expect(sig).toBeDefined();
      expect(sig().isLoading).toBe(false);
    });

    it("should return undefined for an invalid key", () => {
      const sig = store.get("NON_EXISTENT" as TestStoreEnum);
      expect(sig).toBeUndefined();
    });
  });

  describe("update", () => {
    it("should update the state for a valid key", () => {
      store.update(TestStoreEnum.ITEM_ONE, {
        data: "updated",
        status: "Success",
      });
      const sig = store.get(TestStoreEnum.ITEM_ONE);
      expect(sig().data).toBe("updated");
      expect(sig().status).toBe("Success");
      expect(sig().isLoading).toBe(false);
    });

    it("should merge new state with existing state", () => {
      store.update(TestStoreEnum.ITEM_ONE, {
        data: "initial",
        status: "Success",
      });
      store.update(TestStoreEnum.ITEM_ONE, { isLoading: true });

      const state = store.get(TestStoreEnum.ITEM_ONE)();
      expect(state.data).toBe("initial");
      expect(state.isLoading).toBe(true);
      expect(state.status).toBe("Success");
    });

    it("should do nothing for an invalid key", () => {
      expect(() =>
        store.update(
          "INVALID" as TestStoreEnum,
          { data: "test" } as Partial<TestData[TestStoreEnum]>
        )
      ).not.toThrow();
    });
  });

  describe("startLoading", () => {
    it("should set isLoading to true and clear status/errors", () => {
      store.update(TestStoreEnum.ITEM_ONE, {
        data: "test",
        status: "Error",
        errors: [{ code: "E", message: "err" }],
      });
      store.startLoading(TestStoreEnum.ITEM_ONE);

      const state = store.get(TestStoreEnum.ITEM_ONE)();
      expect(state.isLoading).toBe(true);
      expect(state.data).toBe("test");
      expect(state.status).toBeUndefined();
      expect(state.errors).toBeUndefined();
    });

    it("should do nothing for an invalid key", () => {
      expect(() =>
        store.startLoading("INVALID" as TestStoreEnum)
      ).not.toThrow();
    });
  });

  describe("stopLoading", () => {
    it("should set isLoading to false", () => {
      store.startLoading(TestStoreEnum.ITEM_ONE);
      store.stopLoading(TestStoreEnum.ITEM_ONE);

      const state = store.get(TestStoreEnum.ITEM_ONE)();
      expect(state.isLoading).toBe(false);
    });
  });

  describe("clear", () => {
    it("should reset a key to initial state", () => {
      store.update(TestStoreEnum.ITEM_ONE, {
        data: "test",
        status: "Success",
      });
      store.clear(TestStoreEnum.ITEM_ONE);

      const state = store.get(TestStoreEnum.ITEM_ONE)();
      expect(state.data).toBeUndefined();
      expect(state.isLoading).toBe(false);
      expect(state.status).toBeUndefined();
    });
  });

  describe("clearAll", () => {
    it("should reset all keys", () => {
      store.update(TestStoreEnum.ITEM_ONE, { data: "a", status: "Success" });
      store.update(TestStoreEnum.ITEM_TWO, { data: 42, status: "Success" });
      store.clearAll();

      expect(store.get(TestStoreEnum.ITEM_ONE)().data).toBeUndefined();
      expect(store.get(TestStoreEnum.ITEM_TWO)().data).toBeUndefined();
    });
  });

  describe("onUpdate", () => {
    it("should trigger callback on update", () => {
      const callback = vi.fn();
      const cleanup = store.onUpdate(TestStoreEnum.ITEM_ONE, callback);

      store.update(TestStoreEnum.ITEM_ONE, { data: "test", status: "Success" });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ data: "test", status: "Success" }),
        expect.objectContaining({ data: undefined, isLoading: false })
      );

      cleanup();
    });

    it("should not trigger callback after cleanup", () => {
      const callback = vi.fn();
      const cleanup = store.onUpdate(TestStoreEnum.ITEM_ONE, callback);

      store.update(TestStoreEnum.ITEM_ONE, { data: "first" });
      expect(callback).toHaveBeenCalledTimes(1);

      cleanup();

      store.update(TestStoreEnum.ITEM_ONE, { data: "second" });
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should trigger callback on clear", () => {
      const callback = vi.fn();
      const cleanup = store.onUpdate(TestStoreEnum.ITEM_ONE, callback);

      store.update(TestStoreEnum.ITEM_ONE, { data: "test", status: "Success" });
      store.clear(TestStoreEnum.ITEM_ONE);

      expect(callback).toHaveBeenCalledTimes(2);
      cleanup();
    });

    it("should trigger callback on clearAll", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const c1 = store.onUpdate(TestStoreEnum.ITEM_ONE, cb1);
      const c2 = store.onUpdate(TestStoreEnum.ITEM_TWO, cb2);

      store.update(TestStoreEnum.ITEM_ONE, { data: "a" });
      store.update(TestStoreEnum.ITEM_TWO, { data: 1 });
      store.clearAll();

      expect(cb1).toHaveBeenCalledTimes(2);
      expect(cb2).toHaveBeenCalledTimes(2);
      c1();
      c2();
    });

    it("should trigger callback on startLoading and stopLoading", () => {
      const callback = vi.fn();
      const cleanup = store.onUpdate(TestStoreEnum.ITEM_ONE, callback);

      store.startLoading(TestStoreEnum.ITEM_ONE);
      store.stopLoading(TestStoreEnum.ITEM_ONE);

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ isLoading: true, status: undefined }),
        expect.objectContaining({ isLoading: false }),
      );
      expect(callback).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ isLoading: false }),
        expect.objectContaining({ isLoading: true }),
      );

      cleanup();
    });

    it("should handle multiple callbacks independently", () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const c1 = store.onUpdate(TestStoreEnum.ITEM_ONE, cb1);
      const c2 = store.onUpdate(TestStoreEnum.ITEM_ONE, cb2);

      c1();

      store.update(TestStoreEnum.ITEM_ONE, { data: "test" });
      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).toHaveBeenCalledTimes(1);

      c2();
    });

    describe("onUpdate hook error isolation", () => {
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
        const cb1 = vi.fn();
        const cb2 = vi.fn(() => {
          throw new Error("hook failed");
        });
        const cb3 = vi.fn();

        store.onUpdate(TestStoreEnum.ITEM_ONE, cb1);
        store.onUpdate(TestStoreEnum.ITEM_ONE, cb2);
        store.onUpdate(TestStoreEnum.ITEM_ONE, cb3);

        store.update(TestStoreEnum.ITEM_ONE, { data: "x" });

        expect(cb1).toHaveBeenCalledTimes(1);
        expect(cb2).toHaveBeenCalledTimes(1);
        expect(cb3).toHaveBeenCalledTimes(1);
        expect(store.get(TestStoreEnum.ITEM_ONE)().data).toBe("x");

        await new Promise((r) => setTimeout(r, 0));
      });

      it("should call all hooks when multiple throw", async () => {
        const cb1 = vi.fn(() => {
          throw new Error("first");
        });
        const cb2 = vi.fn();
        const cb3 = vi.fn(() => {
          throw new Error("second");
        });

        store.onUpdate(TestStoreEnum.ITEM_ONE, cb1);
        store.onUpdate(TestStoreEnum.ITEM_ONE, cb2);
        store.onUpdate(TestStoreEnum.ITEM_ONE, cb3);

        store.update(TestStoreEnum.ITEM_ONE, { data: "x" });

        expect(cb1).toHaveBeenCalledTimes(1);
        expect(cb2).toHaveBeenCalledTimes(1);
        expect(cb3).toHaveBeenCalledTimes(1);
        expect(store.get(TestStoreEnum.ITEM_ONE)().data).toBe("x");

        await new Promise((r) => setTimeout(r, 0));
      });
    });

    it("should handle different store instances independently", () => {
      const store2 = new TestStore();
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      const c1 = store.onUpdate(TestStoreEnum.ITEM_ONE, cb1);
      const c2 = store2.onUpdate(TestStoreEnum.ITEM_ONE, cb2);

      store.update(TestStoreEnum.ITEM_ONE, { data: "s1" });
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).not.toHaveBeenCalled();

      store2.update(TestStoreEnum.ITEM_ONE, { data: "s2" });
      expect(cb2).toHaveBeenCalledTimes(1);

      c1();
      c2();
    });
  });

  describe("keyed operations", () => {
    it("updateKeyedOne should add entity to keyed data", () => {
      store.updateKeyedOne(TestStoreEnum.ITEM_THREE, "1", {
        id: "1",
        name: "Item 1",
      });

      const state = store.get(TestStoreEnum.ITEM_THREE)();
      const data = state.data as unknown as KeyedResourceData<
        string,
        { id: string; name: string }
      >;
      expect(data["1"]?.data).toEqual({ id: "1", name: "Item 1" });
      expect(data["1"]?.isLoading).toBe(false);
      expect(data["1"]?.status).toBe("Success");
    });

    it("clearKeyedOne should remove a single keyed entity", () => {
      store.updateKeyedOne(TestStoreEnum.ITEM_THREE, "1", {
        id: "1",
        name: "Item 1",
      });
      store.updateKeyedOne(TestStoreEnum.ITEM_THREE, "2", {
        id: "2",
        name: "Item 2",
      });

      store.clearKeyedOne(TestStoreEnum.ITEM_THREE, "1");

      const state = store.get(TestStoreEnum.ITEM_THREE)();
      const data = state.data as unknown as KeyedResourceData<
        string,
        { id: string; name: string }
      >;
      expect(data["1"]).toBeUndefined();
      expect(data["2"]?.data).toEqual({ id: "2", name: "Item 2" });
    });

    it("startKeyedLoading should set loading for a specific key", () => {
      store.updateKeyedOne(TestStoreEnum.ITEM_THREE, "1", {
        id: "1",
        name: "Item 1",
      });

      store.startKeyedLoading(TestStoreEnum.ITEM_THREE, "2");

      const state = store.get(TestStoreEnum.ITEM_THREE)();
      const data = state.data as unknown as KeyedResourceData<
        string,
        { id: string; name: string }
      >;
      expect(data["2"]?.isLoading).toBe(true);
      expect(data["1"]?.isLoading).toBe(false);
      expect(state.isLoading).toBe(true);
    });

    it("startKeyedLoading should initialize keyed entry when slot is empty", () => {
      store.startKeyedLoading(TestStoreEnum.ITEM_THREE, "2");

      const state = store.get(TestStoreEnum.ITEM_THREE)();
      const data = state.data as unknown as KeyedResourceData<
        string,
        { id: string; name: string }
      >;

      expect(data["2"]).toEqual({
        data: undefined,
        isLoading: true,
        status: undefined,
        errors: undefined,
      });
      expect(state.isLoading).toBe(true);
    });

    it("startKeyedLoading should fall back to startLoading if no keyed data", () => {
      (
        store as unknown as {
          startKeyedLoading(key: TestStoreEnum.ITEM_ONE, resourceKey: string): void;
        }
      ).startKeyedLoading(TestStoreEnum.ITEM_ONE, "key1");

      const state = store.get(TestStoreEnum.ITEM_ONE)();
      expect(state.isLoading).toBe(true);
    });

    it("clearKeyedOne should do nothing if data is not keyed", () => {
      store.update(TestStoreEnum.ITEM_ONE, { data: "plain" });
      expect(() =>
        (
          store as unknown as {
            clearKeyedOne(key: TestStoreEnum.ITEM_ONE, resourceKey: string): void;
          }
        ).clearKeyedOne(TestStoreEnum.ITEM_ONE, "key1")
      ).not.toThrow();
    });

    it("startKeyedLoading should notify update hooks", () => {
      const cb = vi.fn();
      const cleanup = store.onUpdate(TestStoreEnum.ITEM_THREE, cb);

      store.updateKeyedOne(TestStoreEnum.ITEM_THREE, "1", {
        id: "1",
        name: "Item 1",
      });
      store.startKeyedLoading(TestStoreEnum.ITEM_THREE, "2");

      expect(cb).toHaveBeenCalledTimes(2);
      cleanup();
    });

    it("get(key).for(rawId) should read default state without materializing slot", () => {
      const historyLengthBefore = store.history().length;
      const messageLengthBefore = store.messages().length;
      const detailSignal = store.get(TestStoreEnum.ITEM_THREE).for("3");

      expect(detailSignal()).toEqual({
        data: undefined,
        isLoading: false,
        status: undefined,
        errors: undefined,
      });

      const state = store.get(TestStoreEnum.ITEM_THREE)();
      expect(state.data).toBeUndefined();
      expect(state.isLoading).toBe(false);
      expect(store.history()).toHaveLength(historyLengthBefore);
      expect(store.messages()).toHaveLength(messageLengthBefore);
    });

    it("get(key).for(signalId) should not throw inside computed()", () => {
      const taskId = signal("1");
      const detailState = computed(() => store.get(TestStoreEnum.ITEM_THREE).for(taskId)());

      expect(() => detailState()).not.toThrow();
      expect(detailState()).toEqual({
        data: undefined,
        isLoading: false,
        status: undefined,
        errors: undefined,
      });
    });

    it("get(key).for(signalId) should follow current key without materializing missing slots", () => {
      const taskId = signal("1");
      const detailSignal = store.get(TestStoreEnum.ITEM_THREE).for(taskId);

      expect(detailSignal().data).toBeUndefined();

      store.updateKeyedOne(TestStoreEnum.ITEM_THREE, "1", {
        id: "1",
        name: "Item 1",
      });
      expect(detailSignal().data).toEqual({ id: "1", name: "Item 1" });

      taskId.set("2");
      expect(detailSignal()).toEqual({
        data: undefined,
        isLoading: false,
        status: undefined,
        errors: undefined,
      });
      const missingState = store.get(TestStoreEnum.ITEM_THREE)();
      const missingData = missingState.data as unknown as KeyedResourceData<
        string,
        { id: string; name: string }
      >;
      expect(missingData["2"]).toBeUndefined();

      store.updateKeyedOne(TestStoreEnum.ITEM_THREE, "2", {
        id: "2",
        name: "Item 2",
      });
      expect(detailSignal().data).toEqual({ id: "2", name: "Item 2" });
    });

    it("clearKeyedOne should notify update hooks", () => {
      const cb = vi.fn();

      store.updateKeyedOne(TestStoreEnum.ITEM_THREE, "1", {
        id: "1",
        name: "Item 1",
      });

      const cleanup = store.onUpdate(TestStoreEnum.ITEM_THREE, cb);
      store.clearKeyedOne(TestStoreEnum.ITEM_THREE, "1");

      expect(cb).toHaveBeenCalledTimes(1);
      cleanup();
    });
  });
});
