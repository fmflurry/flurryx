import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@angular/core", async () => {
  return import("../__mocks__/@angular/core");
});

import { _resetProviders } from "../__mocks__/@angular/core";
import { Store } from "../store-builder";
import { createFromToken, injectFromMock } from "./test-helpers";

interface Company {
  id: string;
  name: string;
}

interface CompanyStoreConfig {
  COMPANIES: Company[];
}

const CompanyStore = Store.for<CompanyStoreConfig>().build();

beforeEach(() => {
  _resetProviders();
});

describe("Store builder .derive()", () => {
  it("should derive to the same target key by default", () => {
    interface SessionStoreConfig {
      COMPANIES: Company[];
      SINGLE: boolean;
    }

    const SessionStore = Store.for<SessionStoreConfig>()
      .derive(CompanyStore, "COMPANIES", "SINGLE", {
        mapData: (companies) => (companies?.length ?? 0) === 1,
      })
      .build();

    const companyStore = injectFromMock(CompanyStore);
    const sessionStore = createFromToken(SessionStore);

    companyStore.update("COMPANIES", {
      data: [{ id: "c1", name: "Alice" }],
      status: "Success",
    });

    expect(sessionStore.get("SINGLE")().data).toBe(true);
    expect(sessionStore.get("SINGLE")().status).toBe("Success");
  });

  it("should derive to a different target key", () => {
    interface SessionStoreConfig {
      ONLY_COMPANY: Company | null;
    }

    const SessionStore = Store.for<SessionStoreConfig>()
      .derive(CompanyStore, "COMPANIES", "ONLY_COMPANY", {
        mapData: (companies) =>
          companies?.length === 1 ? (companies[0] ?? null) : null,
      })
      .build();

    const companyStore = injectFromMock(CompanyStore);
    const sessionStore = createFromToken(SessionStore);

    companyStore.update("COMPANIES", {
      data: [
        { id: "c1", name: "Alice" },
        { id: "c2", name: "Bob" },
      ],
      status: "Success",
    });

    expect(sessionStore.get("ONLY_COMPANY")().data).toBeNull();
    expect(sessionStore.get("ONLY_COMPANY")().status).toBe("Success");
  });

  it("should propagate loading changes through derived state", () => {
    interface SessionStoreConfig {
      SINGLE: boolean;
    }

    const SessionStore = Store.for<SessionStoreConfig>()
      .derive(CompanyStore, "COMPANIES", "SINGLE", {
        mapData: (companies) => (companies?.length ?? 0) === 1,
      })
      .build();

    const companyStore = injectFromMock(CompanyStore);
    const sessionStore = createFromToken(SessionStore);

    companyStore.startLoading("COMPANIES");
    expect(sessionStore.get("SINGLE")().data).toBe(false);
    expect(sessionStore.get("SINGLE")().isLoading).toBe(true);

    companyStore.stopLoading("COMPANIES");
    expect(sessionStore.get("SINGLE")().isLoading).toBe(false);
  });

  it("should react to snapshot restore after source updates", () => {
    interface SessionStoreConfig {
      SINGLE: boolean;
    }

    const SessionStore = Store.for<SessionStoreConfig>()
      .derive(CompanyStore, "COMPANIES", "SINGLE", {
        mapData: (companies) => (companies?.length ?? 0) === 1,
      })
      .build();

    const companyStore = injectFromMock(CompanyStore);
    const sessionStore = createFromToken(SessionStore);

    companyStore.update("COMPANIES", {
      data: [{ id: "c1", name: "Alice" }],
      status: "Success",
    });
    companyStore.update("COMPANIES", {
      data: [
        { id: "c1", name: "Alice" },
        { id: "c2", name: "Bob" },
      ],
      status: "Success",
    });

    expect(sessionStore.get("SINGLE")().data).toBe(false);

    companyStore.restoreStoreAt(1);

    expect(sessionStore.get("SINGLE")().data).toBe(true);
    expect(sessionStore.get("SINGLE")().status).toBe("Success");
  });
});

describe("Store builder .deriveSelf()", () => {
  it("should derive one key from another within the same store", () => {
    interface InvalidConfigStoreConfig {
      COMPANIES: Company[];
      ONLY_COMPANY: Company | null;
      SINGLE: boolean;
    }

    const InvalidConfigStore = Store.for<InvalidConfigStoreConfig>()
      .deriveSelf("COMPANIES", "ONLY_COMPANY", {
        mapData: (companies) =>
          companies?.length === 1 ? (companies[0] ?? null) : null,
      })
      .deriveSelf("COMPANIES", "SINGLE", {
        mapData: (companies) => (companies?.length ?? 0) === 1,
      })
      .build();

    const store = createFromToken(InvalidConfigStore);

    store.update("COMPANIES", {
      data: [{ id: "c1", name: "Alice" }],
      status: "Success",
    });

    expect(store.get("ONLY_COMPANY")().data).toEqual({
      id: "c1",
      name: "Alice",
    });
    expect(store.get("SINGLE")().data).toBe(true);
  });

  it("should react when the source key is populated by another mirror", () => {
    interface SessionStoreConfig {
      COMPANIES: Company[];
      SINGLE: boolean;
    }

    const SessionStore = Store.for<SessionStoreConfig>()
      .mirror(CompanyStore, "COMPANIES")
      .deriveSelf("COMPANIES", "SINGLE", {
        mapData: (companies) => (companies?.length ?? 0) === 1,
      })
      .build();

    const companyStore = injectFromMock(CompanyStore);
    const sessionStore = createFromToken(SessionStore);

    companyStore.update("COMPANIES", {
      data: [{ id: "c1", name: "Alice" }],
      status: "Success",
    });

    expect(sessionStore.get("COMPANIES")().data).toEqual([
      { id: "c1", name: "Alice" },
    ]);
    expect(sessionStore.get("SINGLE")().data).toBe(true);
  });

  it("should reject deriving a key from itself", () => {
    interface SessionStoreConfig {
      SINGLE: boolean;
    }

    const SessionStore = Store.for<SessionStoreConfig>()
      .deriveSelf("SINGLE", "SINGLE", {
        mapData: (value) => Boolean(value),
      })
      .build();

    expect(() => createFromToken(SessionStore)).toThrowError(
      "mirrorSelf source and target keys must be different",
    );
  });
});
