import { describe, it, expect, beforeEach } from "vitest";

import { vi } from "vitest";

vi.mock("@angular/core", async () => {
  return import("../__mocks__/@angular/core");
});

import { inject, _resetProviders } from "../__mocks__/@angular/core";
import { Store } from "../store-builder";
import type {
  ResourceState,
  KeyedResourceData,
  KeyedResourceKey,
} from "@flurryx/core";

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

// Source stores (feature stores) — single-entity keys for collectKeyed
interface CustomerStoreConfig {
  CUSTOMERS: Customer[];
  CUSTOMER_DETAILS: Customer;
}

interface OrderStoreConfig {
  ORDERS: Order[];
  ORDER_DETAILS: Order;
}

const CustomerStore = Store.for<CustomerStoreConfig>().build();
const OrderStore = Store.for<OrderStoreConfig>().build();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const extractCustomerId = (
  data: Customer | undefined
): KeyedResourceKey | undefined => data?.id;

const extractOrderId = (
  data: Order | undefined
): KeyedResourceKey | undefined => data?.id;

beforeEach(() => {
  _resetProviders();
});

// ---------------------------------------------------------------------------
// Unconstrained builder: Store.resource().as().mirrorKeyed().build()
// ---------------------------------------------------------------------------

describe("Store builder .mirrorKeyed() — unconstrained builder", () => {
  it("should mirrorKeyed a source key to the same target key", () => {
    const SessionStore = Store.resource("CUSTOMER_DETAILS")
      .as<KeyedResourceData<string, Customer>>()
      .mirrorKeyed(CustomerStore, "CUSTOMER_DETAILS", {
        extractId: extractCustomerId,
      })
      .build();

    const customerStore = inject(CustomerStore);
    const sessionStore = SessionStore.options!.factory();

    customerStore.update("CUSTOMER_DETAILS", {
      data: { id: "c1", name: "Alice" },
      status: "Success",
      isLoading: false,
    });

    const state = sessionStore.get("CUSTOMER_DETAILS")();
    expect(state.data!.entities["c1"]).toEqual({ id: "c1", name: "Alice" });
    expect(state.data!.status["c1"]).toBe("Success");
  });

  it("should mirrorKeyed to a different target key", () => {
    const SessionStore = Store.resource("CUSTOMER_CACHE")
      .as<KeyedResourceData<string, Customer>>()
      .mirrorKeyed(
        CustomerStore,
        "CUSTOMER_DETAILS",
        { extractId: extractCustomerId },
        "CUSTOMER_CACHE"
      )
      .build();

    const customerStore = inject(CustomerStore);
    const sessionStore = SessionStore.options!.factory();

    customerStore.update("CUSTOMER_DETAILS", {
      data: { id: "c1", name: "Alice" },
      status: "Success",
      isLoading: false,
    });

    const state = sessionStore.get("CUSTOMER_CACHE")();
    expect(state.data!.entities["c1"]).toEqual({ id: "c1", name: "Alice" });
  });

  it("should accumulate multiple entities", () => {
    const SessionStore = Store.resource("CUSTOMER_DETAILS")
      .as<KeyedResourceData<string, Customer>>()
      .mirrorKeyed(CustomerStore, "CUSTOMER_DETAILS", {
        extractId: extractCustomerId,
      })
      .build();

    const customerStore = inject(CustomerStore);
    const sessionStore = SessionStore.options!.factory();

    customerStore.update("CUSTOMER_DETAILS", {
      data: { id: "c1", name: "Alice" },
      status: "Success",
      isLoading: false,
    });

    customerStore.update("CUSTOMER_DETAILS", {
      data: { id: "c2", name: "Bob" },
      status: "Success",
      isLoading: false,
    });

    const state = sessionStore.get("CUSTOMER_DETAILS")();
    expect(state.data!.entities["c1"]).toEqual({ id: "c1", name: "Alice" });
    expect(state.data!.entities["c2"]).toEqual({ id: "c2", name: "Bob" });
  });

  it("should support mirror and mirrorKeyed combined", () => {
    const SessionStore = Store.resource("CUSTOMERS")
      .as<Customer[]>()
      .resource("CUSTOMER_DETAILS")
      .as<KeyedResourceData<string, Customer>>()
      .mirror(CustomerStore, "CUSTOMERS")
      .mirrorKeyed(CustomerStore, "CUSTOMER_DETAILS", {
        extractId: extractCustomerId,
      })
      .build();

    const customerStore = inject(CustomerStore);
    const sessionStore = SessionStore.options!.factory();

    // Mirror works
    customerStore.update("CUSTOMERS", {
      data: [{ id: "c1", name: "Alice" }],
      status: "Success",
    });

    expect(sessionStore.get("CUSTOMERS")().data).toEqual([
      { id: "c1", name: "Alice" },
    ]);

    // MirrorKeyed works
    customerStore.update("CUSTOMER_DETAILS", {
      data: { id: "c1", name: "Alice" },
      status: "Success",
      isLoading: false,
    });

    expect(
      sessionStore.get("CUSTOMER_DETAILS")().data!.entities["c1"]
    ).toEqual({ id: "c1", name: "Alice" });
  });
});

// ---------------------------------------------------------------------------
// Interface-based builder: Store.for<Config>().mirrorKeyed().build()
// ---------------------------------------------------------------------------

interface SessionConfig {
  CUSTOMERS: Customer[];
  CUSTOMER_DETAILS: KeyedResourceData<string, Customer>;
  ORDERS: Order[];
}

describe("Store builder .mirrorKeyed() — interface-based builder", () => {
  it("should mirrorKeyed a source key using same key", () => {
    const SessionStore = Store.for<SessionConfig>()
      .mirrorKeyed(CustomerStore, "CUSTOMER_DETAILS", {
        extractId: extractCustomerId,
      })
      .build();

    const customerStore = inject(CustomerStore);
    const sessionStore = SessionStore.options!.factory();

    customerStore.update("CUSTOMER_DETAILS", {
      data: { id: "c1", name: "Alice" },
      status: "Success",
      isLoading: false,
    });

    const state = sessionStore.get("CUSTOMER_DETAILS")();
    expect(state.data!.entities["c1"]).toEqual({ id: "c1", name: "Alice" });
  });

  it("should support multiple mirrors and mirrorKeyed combined", () => {
    const SessionStore = Store.for<SessionConfig>()
      .mirror(CustomerStore, "CUSTOMERS")
      .mirror(OrderStore, "ORDERS")
      .mirrorKeyed(CustomerStore, "CUSTOMER_DETAILS", {
        extractId: extractCustomerId,
      })
      .build();

    const customerStore = inject(CustomerStore);
    const orderStore = inject(OrderStore);
    const sessionStore = SessionStore.options!.factory();

    customerStore.update("CUSTOMERS", {
      data: [{ id: "c1", name: "Alice" }],
    });
    orderStore.update("ORDERS", {
      data: [{ id: "o1", total: 50 }],
    });
    customerStore.update("CUSTOMER_DETAILS", {
      data: { id: "c1", name: "Alice" },
      status: "Success",
      isLoading: false,
    });

    expect(sessionStore.get("CUSTOMERS")().data).toEqual([
      { id: "c1", name: "Alice" },
    ]);
    expect(sessionStore.get("ORDERS")().data).toEqual([
      { id: "o1", total: 50 },
    ]);
    expect(
      sessionStore.get("CUSTOMER_DETAILS")().data!.entities["c1"]
    ).toEqual({ id: "c1", name: "Alice" });
  });

  it("should remove entity when source is cleared", () => {
    const SessionStore = Store.for<SessionConfig>()
      .mirrorKeyed(CustomerStore, "CUSTOMER_DETAILS", {
        extractId: extractCustomerId,
      })
      .build();

    const customerStore = inject(CustomerStore);
    const sessionStore = SessionStore.options!.factory();

    customerStore.update("CUSTOMER_DETAILS", {
      data: { id: "c1", name: "Alice" },
      status: "Success",
      isLoading: false,
    });

    expect(
      sessionStore.get("CUSTOMER_DETAILS")().data!.entities["c1"]
    ).toBeDefined();

    customerStore.clear("CUSTOMER_DETAILS");

    expect(
      sessionStore.get("CUSTOMER_DETAILS")().data!.entities["c1"]
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Constrained builder: Store.for(enum).mirrorKeyed().build()
// ---------------------------------------------------------------------------

const SessionEnum = {
  CUSTOMERS: "CUSTOMERS",
  CUSTOMER_DETAILS: "CUSTOMER_DETAILS",
} as const;

describe("Store builder .mirrorKeyed() — constrained builder", () => {
  it("should mirrorKeyed after all resources are defined", () => {
    const SessionStore = Store.for(SessionEnum)
      .resource("CUSTOMERS")
      .as<Customer[]>()
      .resource("CUSTOMER_DETAILS")
      .as<KeyedResourceData<string, Customer>>()
      .mirror(CustomerStore, "CUSTOMERS")
      .mirrorKeyed(CustomerStore, "CUSTOMER_DETAILS", {
        extractId: extractCustomerId,
      })
      .build();

    const customerStore = inject(CustomerStore);
    const sessionStore = SessionStore.options!.factory();

    customerStore.update("CUSTOMERS", {
      data: [{ id: "c1", name: "Alice" }],
    });
    customerStore.update("CUSTOMER_DETAILS", {
      data: { id: "c1", name: "Alice" },
      status: "Success",
      isLoading: false,
    });

    expect(sessionStore.get("CUSTOMERS")().data).toEqual([
      { id: "c1", name: "Alice" },
    ]);
    expect(
      sessionStore.get("CUSTOMER_DETAILS")().data!.entities["c1"]
    ).toEqual({ id: "c1", name: "Alice" });
  });
});
