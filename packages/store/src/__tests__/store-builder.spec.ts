import { describe, it, expect, vi } from "vitest";

vi.mock("@angular/core", async () => {
  return import("../__mocks__/@angular/core");
});

import { Store } from "../store-builder";
import type { ResourceState } from "@flurryx/core";

interface Product {
  id: string;
  price: number;
}

describe("Store fluent builder", () => {
  it("should build a store with a single resource", () => {
    const token = Store.resource("products").as<Product[]>().build();

    expect(token).toBeDefined();
    expect(token.description).toBe("FlurryxStore");

    const store = token.options!.factory();
    const sig = store.get("products");
    expect(sig).toBeDefined();
    expect(sig().isLoading).toBe(false);
    expect(sig().data).toBeUndefined();
  });

  it("should build a store with multiple resources", () => {
    const token = Store.resource("products")
      .as<Product[]>()
      .resource("selectedProduct")
      .as<Product>()
      .build();

    const store = token.options!.factory();

    expect(store.get("products")).toBeDefined();
    expect(store.get("selectedProduct")).toBeDefined();
  });

  it("should support update operations on built store", () => {
    const token = Store.resource("items").as<string[]>().build();

    const store = token.options!.factory();

    store.update("items", {
      data: ["a", "b"],
      status: "Success",
    });

    const state = store.get("items")();
    expect(state.data).toEqual(["a", "b"]);
    expect(state.status).toBe("Success");
  });

  it("should support startLoading/stopLoading on built store", () => {
    const token = Store.resource("data").as<number>().build();

    const store = token.options!.factory();

    store.startLoading("data");
    expect(store.get("data")().isLoading).toBe(true);

    store.stopLoading("data");
    expect(store.get("data")().isLoading).toBe(false);
  });

  it("should support clear and clearAll on built store", () => {
    const token = Store.resource("a")
      .as<string>()
      .resource("b")
      .as<number>()
      .build();

    const store = token.options!.factory();

    store.update("a", { data: "hello" });
    store.update("b", { data: 99 });

    store.clear("a");
    expect(store.get("a")().data).toBeUndefined();
    expect(store.get("b")().data).toBe(99);

    store.clearAll();
    expect(store.get("b")().data).toBeUndefined();
  });

  it("should support onUpdate callbacks on built store", () => {
    const token = Store.resource("items").as<string>().build();

    const store = token.options!.factory();
    const callback = vi.fn();
    const cleanup = store.onUpdate("items", callback);

    store.update("items", { data: "test" });
    expect(callback).toHaveBeenCalledTimes(1);

    cleanup();
    store.update("items", { data: "after" });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should produce independent store instances per factory call", () => {
    const token = Store.resource("count").as<number>().build();

    const store1 = token.options!.factory();
    const store2 = token.options!.factory();

    store1.update("count", { data: 42 });
    expect(store1.get("count")().data).toBe(42);
    expect(store2.get("count")().data).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Constrained builder: Store.for(enum)
// ---------------------------------------------------------------------------

interface ChatSession {
  id: string;
  title: string;
}

interface ChatMessage {
  role: string;
  content: string;
}

const ChatStoreEnum = {
  SESSIONS: "SESSIONS",
  CURRENT_SESSION: "CURRENT_SESSION",
  MESSAGES: "MESSAGES",
} as const;

describe("Store.for() constrained builder", () => {
  it("should build a store with all enum keys defined", () => {
    const token = Store.for(ChatStoreEnum)
      .resource("SESSIONS")
      .as<ChatSession[]>()
      .resource("CURRENT_SESSION")
      .as<ChatSession>()
      .resource("MESSAGES")
      .as<ChatMessage[]>()
      .build();

    expect(token).toBeDefined();
    expect(token.description).toBe("FlurryxStore");

    const store = token.options!.factory();
    expect(store.get("SESSIONS")).toBeDefined();
    expect(store.get("CURRENT_SESSION")).toBeDefined();
    expect(store.get("MESSAGES")).toBeDefined();
  });

  it("should initialize signals with default state", () => {
    const token = Store.for(ChatStoreEnum)
      .resource("SESSIONS")
      .as<ChatSession[]>()
      .resource("CURRENT_SESSION")
      .as<ChatSession>()
      .resource("MESSAGES")
      .as<ChatMessage[]>()
      .build();

    const store = token.options!.factory();
    const sessions = store.get("SESSIONS")();

    expect(sessions.isLoading).toBe(false);
    expect(sessions.data).toBeUndefined();
  });

  it("should support update operations", () => {
    const token = Store.for(ChatStoreEnum)
      .resource("SESSIONS")
      .as<ChatSession[]>()
      .resource("CURRENT_SESSION")
      .as<ChatSession>()
      .resource("MESSAGES")
      .as<ChatMessage[]>()
      .build();

    const store = token.options!.factory();

    store.update("MESSAGES", {
      data: [{ role: "user", content: "hello" }],
      status: "Success",
    });

    const state = store.get("MESSAGES")();
    expect(state.data).toEqual([{ role: "user", content: "hello" }]);
    expect(state.status).toBe("Success");
  });

  it("should support startLoading and stopLoading", () => {
    const token = Store.for(ChatStoreEnum)
      .resource("SESSIONS")
      .as<ChatSession[]>()
      .resource("CURRENT_SESSION")
      .as<ChatSession>()
      .resource("MESSAGES")
      .as<ChatMessage[]>()
      .build();

    const store = token.options!.factory();

    store.startLoading("SESSIONS");
    expect(store.get("SESSIONS")().isLoading).toBe(true);

    store.stopLoading("SESSIONS");
    expect(store.get("SESSIONS")().isLoading).toBe(false);
  });

  it("should support clear and clearAll", () => {
    const token = Store.for(ChatStoreEnum)
      .resource("SESSIONS")
      .as<ChatSession[]>()
      .resource("CURRENT_SESSION")
      .as<ChatSession>()
      .resource("MESSAGES")
      .as<ChatMessage[]>()
      .build();

    const store = token.options!.factory();

    store.update("SESSIONS", { data: [{ id: "1", title: "test" }] });
    store.update("MESSAGES", { data: [{ role: "user", content: "hi" }] });

    store.clear("SESSIONS");
    expect(store.get("SESSIONS")().data).toBeUndefined();
    expect(store.get("MESSAGES")().data).toEqual([
      { role: "user", content: "hi" },
    ]);

    store.clearAll();
    expect(store.get("MESSAGES")().data).toBeUndefined();
  });

  it("should support onUpdate callbacks", () => {
    const token = Store.for(ChatStoreEnum)
      .resource("SESSIONS")
      .as<ChatSession[]>()
      .resource("CURRENT_SESSION")
      .as<ChatSession>()
      .resource("MESSAGES")
      .as<ChatMessage[]>()
      .build();

    const store = token.options!.factory();
    const callback = vi.fn();
    const cleanup = store.onUpdate("CURRENT_SESSION", callback);

    store.update("CURRENT_SESSION", { data: { id: "1", title: "chat" } });
    expect(callback).toHaveBeenCalledTimes(1);

    cleanup();
    store.update("CURRENT_SESSION", { data: { id: "2", title: "new" } });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should produce independent instances per factory call", () => {
    const token = Store.for(ChatStoreEnum)
      .resource("SESSIONS")
      .as<ChatSession[]>()
      .resource("CURRENT_SESSION")
      .as<ChatSession>()
      .resource("MESSAGES")
      .as<ChatMessage[]>()
      .build();

    const store1 = token.options!.factory();
    const store2 = token.options!.factory();

    store1.update("SESSIONS", { data: [{ id: "1", title: "a" }] });
    expect(store1.get("SESSIONS")().data).toEqual([{ id: "1", title: "a" }]);
    expect(store2.get("SESSIONS")().data).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Interface-based builder: Store.for<Config>().build()
// ---------------------------------------------------------------------------

interface AppConfig {
  SESSIONS: ChatSession[];
  CURRENT_SESSION: ChatSession;
  MESSAGES: ChatMessage[];
}

describe("Store.for<Config>().build() interface-based builder", () => {
  it("should build a store via interface generic with no runtime arg", () => {
    const token = Store.for<AppConfig>().build();

    expect(token).toBeDefined();
    expect(token.description).toBe("FlurryxStore");
  });

  it("should produce a working lazy store from factory", () => {
    const token = Store.for<AppConfig>().build();
    const store = token.options!.factory();

    const sig = store.get("SESSIONS");
    expect(sig).toBeDefined();
    expect(sig().isLoading).toBe(false);
    expect(sig().data).toBeUndefined();
  });

  it("should support update operations", () => {
    const token = Store.for<AppConfig>().build();
    const store = token.options!.factory();

    store.update("MESSAGES", {
      data: [{ role: "user", content: "hello" }],
      status: "Success",
    });

    const state = store.get("MESSAGES")();
    expect(state.data).toEqual([{ role: "user", content: "hello" }]);
    expect(state.status).toBe("Success");
  });

  it("should support startLoading and stopLoading", () => {
    const token = Store.for<AppConfig>().build();
    const store = token.options!.factory();

    store.startLoading("SESSIONS");
    expect(store.get("SESSIONS")().isLoading).toBe(true);

    store.stopLoading("SESSIONS");
    expect(store.get("SESSIONS")().isLoading).toBe(false);
  });

  it("should support clear and clearAll", () => {
    const token = Store.for<AppConfig>().build();
    const store = token.options!.factory();

    store.update("SESSIONS", { data: [{ id: "1", title: "test" }] });
    store.update("MESSAGES", { data: [{ role: "user", content: "hi" }] });

    store.clear("SESSIONS");
    expect(store.get("SESSIONS")().data).toBeUndefined();
    expect(store.get("MESSAGES")().data).toEqual([
      { role: "user", content: "hi" },
    ]);

    store.clearAll();
    expect(store.get("MESSAGES")().data).toBeUndefined();
  });

  it("should support onUpdate callbacks", () => {
    const token = Store.for<AppConfig>().build();
    const store = token.options!.factory();
    const callback = vi.fn();

    const cleanup = store.onUpdate("CURRENT_SESSION", callback);
    store.update("CURRENT_SESSION", { data: { id: "1", title: "chat" } });
    expect(callback).toHaveBeenCalledTimes(1);

    cleanup();
    store.update("CURRENT_SESSION", { data: { id: "2", title: "new" } });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("should produce independent instances per factory call", () => {
    const token = Store.for<AppConfig>().build();
    const store1 = token.options!.factory();
    const store2 = token.options!.factory();

    store1.update("SESSIONS", { data: [{ id: "1", title: "a" }] });
    expect(store1.get("SESSIONS")().data).toEqual([{ id: "1", title: "a" }]);
    expect(store2.get("SESSIONS")().data).toBeUndefined();
  });
});
