import { describe, it, expect, beforeEach } from "vitest";

import { vi } from "vitest";

vi.mock("@angular/core", async () => {
  return import("../__mocks__/@angular/core");
});

import { inject, _resetProviders } from "../__mocks__/@angular/core";
import { Store } from "../store-builder";
import type { ResourceState } from "@flurryx/core";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

interface Customer {
  id: string;
  name: string;
}

interface Order {
  id: string;
  total: number;
}

interface Item {
  sku: string;
  qty: number;
}

// Source stores (feature stores)
interface CustomerStoreConfig {
  CUSTOMERS: Customer[];
}

interface OrderStoreConfig {
  ORDERS: Order[];
}

interface ItemStoreConfig {
  ITEMS: Item[];
}

const CustomerStore = Store.for<CustomerStoreConfig>().build();
const OrderStore = Store.for<OrderStoreConfig>().build();
const ItemStore = Store.for<ItemStoreConfig>().build();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  _resetProviders();
});

// ---------------------------------------------------------------------------
// Unconstrained builder: Store.resource().as().mirror().build()
// ---------------------------------------------------------------------------

describe("Store builder .mirror() — unconstrained builder", () => {
  it("should mirror a source key to the same target key", () => {
    const SessionStore = Store.resource("CUSTOMERS")
      .as<Customer[]>()
      .mirror(CustomerStore, "CUSTOMERS")
      .build();

    // Resolve source store and session store through mock DI
    const customerStore = inject(CustomerStore);
    const sessionStore = SessionStore.options!.factory();

    customerStore.update("CUSTOMERS", {
      data: [{ id: "1", name: "Alice" }],
      status: "Success",
    });

    const state = sessionStore.get("CUSTOMERS")();
    expect(state.data).toEqual([{ id: "1", name: "Alice" }]);
    expect(state.status).toBe("Success");
  });

  it("should mirror a source key to a different target key", () => {
    const SessionStore = Store.resource("ARTICLES")
      .as<Item[]>()
      .mirror(ItemStore, "ITEMS", "ARTICLES")
      .build();

    const itemStore = inject(ItemStore);
    const sessionStore = SessionStore.options!.factory();

    itemStore.update("ITEMS", {
      data: [{ sku: "A1", qty: 5 }],
      status: "Success",
    });

    const state = sessionStore.get("ARTICLES")();
    expect(state.data).toEqual([{ sku: "A1", qty: 5 }]);
  });

  it("should support multiple mirrors on a single store", () => {
    const SessionStore = Store.resource("CUSTOMERS")
      .as<Customer[]>()
      .resource("ORDERS")
      .as<Order[]>()
      .mirror(CustomerStore, "CUSTOMERS")
      .mirror(OrderStore, "ORDERS")
      .build();

    const customerStore = inject(CustomerStore);
    const orderStore = inject(OrderStore);
    const sessionStore = SessionStore.options!.factory();

    customerStore.update("CUSTOMERS", {
      data: [{ id: "1", name: "Alice" }],
      status: "Success",
    });

    orderStore.update("ORDERS", {
      data: [{ id: "o1", total: 100 }],
      status: "Success",
    });

    expect(sessionStore.get("CUSTOMERS")().data).toEqual([
      { id: "1", name: "Alice" },
    ]);
    expect(sessionStore.get("ORDERS")().data).toEqual([
      { id: "o1", total: 100 },
    ]);
  });

  it("should mirror loading state from source to target", () => {
    const SessionStore = Store.resource("CUSTOMERS")
      .as<Customer[]>()
      .mirror(CustomerStore, "CUSTOMERS")
      .build();

    const customerStore = inject(CustomerStore);
    const sessionStore = SessionStore.options!.factory();

    customerStore.update("CUSTOMERS", { isLoading: true });

    expect(sessionStore.get("CUSTOMERS")().isLoading).toBe(true);
  });

  it("should mirror error state from source to target", () => {
    const SessionStore = Store.resource("CUSTOMERS")
      .as<Customer[]>()
      .mirror(CustomerStore, "CUSTOMERS")
      .build();

    const customerStore = inject(CustomerStore);
    const sessionStore = SessionStore.options!.factory();

    customerStore.update("CUSTOMERS", {
      status: "Error",
      errors: [{ code: "500", message: "Server error" }],
    });

    const state = sessionStore.get("CUSTOMERS")();
    expect(state.status).toBe("Error");
    expect(state.errors).toEqual([{ code: "500", message: "Server error" }]);
  });

  it("should still allow normal store operations alongside mirrors", () => {
    const SessionStore = Store.resource("CUSTOMERS")
      .as<Customer[]>()
      .resource("LOCAL_DATA")
      .as<string>()
      .mirror(CustomerStore, "CUSTOMERS")
      .build();

    const customerStore = inject(CustomerStore);
    const sessionStore = SessionStore.options!.factory();

    // Mirror works
    customerStore.update("CUSTOMERS", {
      data: [{ id: "1", name: "Bob" }],
    });
    expect(sessionStore.get("CUSTOMERS")().data).toEqual([
      { id: "1", name: "Bob" },
    ]);

    // Local data works independently
    sessionStore.update("LOCAL_DATA", { data: "hello" });
    expect(sessionStore.get("LOCAL_DATA")().data).toBe("hello");
  });
});

// ---------------------------------------------------------------------------
// Interface-based builder: Store.for<Config>().mirror().build()
// ---------------------------------------------------------------------------

interface SessionConfig {
  CUSTOMERS: Customer[];
  ORDERS: Order[];
}

describe("Store builder .mirror() — interface-based builder", () => {
  it("should mirror a source key using same key", () => {
    const SessionStore = Store.for<SessionConfig>()
      .mirror(CustomerStore, "CUSTOMERS")
      .build();

    const customerStore = inject(CustomerStore);
    const sessionStore = SessionStore.options!.factory();

    customerStore.update("CUSTOMERS", {
      data: [{ id: "1", name: "Alice" }],
      status: "Success",
    });

    expect(sessionStore.get("CUSTOMERS")().data).toEqual([
      { id: "1", name: "Alice" },
    ]);
  });

  it("should support multiple mirrors", () => {
    const SessionStore = Store.for<SessionConfig>()
      .mirror(CustomerStore, "CUSTOMERS")
      .mirror(OrderStore, "ORDERS")
      .build();

    const customerStore = inject(CustomerStore);
    const orderStore = inject(OrderStore);
    const sessionStore = SessionStore.options!.factory();

    customerStore.update("CUSTOMERS", {
      data: [{ id: "1", name: "Alice" }],
    });
    orderStore.update("ORDERS", {
      data: [{ id: "o1", total: 50 }],
    });

    expect(sessionStore.get("CUSTOMERS")().data).toEqual([
      { id: "1", name: "Alice" },
    ]);
    expect(sessionStore.get("ORDERS")().data).toEqual([
      { id: "o1", total: 50 },
    ]);
  });

  it("should mirror to a different target key", () => {
    interface AggregateConfig {
      ARTICLES: Item[];
    }

    const AggregateStore = Store.for<AggregateConfig>()
      .mirror(ItemStore, "ITEMS", "ARTICLES")
      .build();

    const itemStore = inject(ItemStore);
    const aggStore = AggregateStore.options!.factory();

    itemStore.update("ITEMS", {
      data: [{ sku: "X1", qty: 10 }],
      status: "Success",
    });

    expect(aggStore.get("ARTICLES")().data).toEqual([{ sku: "X1", qty: 10 }]);
  });
});

// ---------------------------------------------------------------------------
// Constrained builder: Store.for(enum).mirror().build()
// ---------------------------------------------------------------------------

const SessionEnum = {
  CUSTOMERS: "CUSTOMERS",
  ORDERS: "ORDERS",
} as const;

describe("Store builder .mirror() — constrained builder", () => {
  it("should mirror a source key after all resources are defined", () => {
    const SessionStore = Store.for(SessionEnum)
      .resource("CUSTOMERS")
      .as<Customer[]>()
      .resource("ORDERS")
      .as<Order[]>()
      .mirror(CustomerStore, "CUSTOMERS")
      .mirror(OrderStore, "ORDERS")
      .build();

    const customerStore = inject(CustomerStore);
    const orderStore = inject(OrderStore);
    const sessionStore = SessionStore.options!.factory();

    customerStore.update("CUSTOMERS", {
      data: [{ id: "1", name: "Alice" }],
    });
    orderStore.update("ORDERS", {
      data: [{ id: "o1", total: 200 }],
    });

    expect(sessionStore.get("CUSTOMERS")().data).toEqual([
      { id: "1", name: "Alice" },
    ]);
    expect(sessionStore.get("ORDERS")().data).toEqual([
      { id: "o1", total: 200 },
    ]);
  });
});
