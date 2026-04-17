import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@angular/core", async () => {
  return import("../__mocks__/@angular/core");
});

import { _resetProviders } from "../__mocks__/@angular/core";
import { BaseStore } from "../base-store";
import { LazyStore } from "../lazy-store";
import { clearAllStores } from "../index";
import { resetTrackedStoresForTests } from "../store-registry";
import { Store } from "../store-builder";
import { createFromToken, injectFromMock } from "./test-helpers";
import type { KeyedResourceData, ResourceState } from "@flurryx/core";

enum DirectStoreEnum {
  ITEMS = "ITEMS",
  COUNT = "COUNT",
}

interface DirectStoreData {
  [DirectStoreEnum.ITEMS]: ResourceState<string[]>;
  [DirectStoreEnum.COUNT]: ResourceState<number>;
}

class DirectStore extends BaseStore<typeof DirectStoreEnum, DirectStoreData> {
  constructor() {
    super(DirectStoreEnum);
  }
}

interface LazyTestData {
  ITEMS: ResourceState<string[]>;
  COUNT: ResourceState<number>;
}

interface Session {
  id: string;
  tenantId: string;
}

interface Message {
  id: string;
  body: string;
}

const SessionStoreEnum = {
  SESSION: "SESSION",
  MESSAGES: "MESSAGES",
} as const;

interface InterfaceStoreConfig {
  PROFILE: { id: string; tenantId: string };
  CACHE_VERSION: number;
}

interface Customer {
  id: string;
  name: string;
}

interface CustomerStoreConfig {
  CUSTOMER: Customer;
}

interface CustomerCacheConfig {
  CUSTOMER_CACHE: KeyedResourceData<string, Customer>;
}

beforeEach(() => {
  _resetProviders();
  resetTrackedStoresForTests();
});

describe("clearAllStores", () => {
  it("clears tracked BaseStore subclasses and direct LazyStore instances", () => {
    const directStore = new DirectStore();
    const lazyStore = new LazyStore<LazyTestData>();

    directStore.update(DirectStoreEnum.ITEMS, {
      data: ["tenant-a-item"],
      status: "Success",
    });
    lazyStore.update("COUNT", { data: 3, status: "Success" });

    clearAllStores();

    expect(directStore.get(DirectStoreEnum.ITEMS)()).toEqual({
      data: undefined,
      isLoading: false,
      status: undefined,
      errors: undefined,
    });
    expect(lazyStore.get("COUNT")()).toEqual({
      data: undefined,
      isLoading: false,
      status: undefined,
      errors: undefined,
    });
  });

  it("clears stores created by all builder styles", () => {
    const fluentToken = Store.resource("SESSION").as<Session>().build();
    const constrainedToken = Store.for(SessionStoreEnum)
      .resource("SESSION")
      .as<Session>()
      .resource("MESSAGES")
      .as<Message[]>()
      .build();
    const interfaceToken = Store.for<InterfaceStoreConfig>().build();

    const fluentStore = createFromToken(fluentToken);
    const constrainedStore = createFromToken(constrainedToken);
    const interfaceStore = createFromToken(interfaceToken);

    fluentStore.update("SESSION", {
      data: { id: "session-1", tenantId: "tenant-a" },
      status: "Success",
    });
    constrainedStore.update("MESSAGES", {
      data: [{ id: "message-1", body: "hello" }],
      status: "Success",
    });
    interfaceStore.update("PROFILE", {
      data: { id: "profile-1", tenantId: "tenant-a" },
      status: "Success",
    });

    clearAllStores();

    expect(fluentStore.get("SESSION")().data).toBeUndefined();
    expect(constrainedStore.get("MESSAGES")().data).toBeUndefined();
    expect(interfaceStore.get("PROFILE")().data).toBeUndefined();
  });

  it("clears mirrored keyed stores without leaving cached data behind", () => {
    const CustomerStore = Store.for<CustomerStoreConfig>().build();
    const CustomerCacheStore = Store.for<CustomerCacheConfig>()
      .mirrorKeyed(CustomerStore, "CUSTOMER", {
        extractId: (data: Customer | undefined) => data?.id,
      }, "CUSTOMER_CACHE")
      .build();

    const customerStore = injectFromMock(CustomerStore);
    const customerCacheStore = createFromToken(CustomerCacheStore);

    customerStore.update("CUSTOMER", {
      data: { id: "customer-1", name: "Alice" },
      status: "Success",
    });

    const customerCacheState = customerCacheStore.get("CUSTOMER_CACHE")();
    const keyedData = customerCacheState.data as KeyedResourceData<
      string,
      Customer
    >;
    expect(keyedData["customer-1"]?.data).toEqual({
      id: "customer-1",
      name: "Alice",
    });

    clearAllStores();

    expect(customerStore.get("CUSTOMER")()).toEqual({
      data: undefined,
      isLoading: false,
      status: undefined,
      errors: undefined,
    });
    expect(customerCacheStore.get("CUSTOMER_CACHE")()).toEqual({
      data: undefined,
      isLoading: false,
      status: undefined,
      errors: undefined,
    });
  });
});
