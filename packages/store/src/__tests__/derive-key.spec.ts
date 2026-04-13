import { describe, expect, it, vi } from "vitest";

vi.mock("@angular/core", async () => {
  return import("../__mocks__/@angular/core");
});

import { LazyStore } from "../lazy-store";
import { deriveKey } from "../derive-key";
import type { IStore } from "../types";
import type { ResourceState } from "@flurryx/core";

type SourceData = {
  COMPANIES: ResourceState<Array<{ id: string; name: string }>>;
};

type TargetData = {
  ONLY_COMPANY: ResourceState<{ id: string; name: string } | null>;
  SINGLE: ResourceState<boolean>;
};

function createSource(): IStore<SourceData> {
  return new LazyStore<SourceData>();
}

function createTarget(): IStore<TargetData> {
  return new LazyStore<TargetData>();
}

describe("deriveKey", () => {
  it("should derive target data from source data", () => {
    const source = createSource();
    const target = createTarget();

    deriveKey(source, "COMPANIES", target, "SINGLE", {
      mapData: (companies) => (companies?.length ?? 0) === 1,
    });

    source.update("COMPANIES", {
      data: [{ id: "c1", name: "Alice" }],
      status: "Success",
    });

    expect(target.get("SINGLE")().data).toBe(true);
    expect(target.get("SINGLE")().status).toBe("Success");
  });

  it("should mirror source loading and error metadata", () => {
    const source = createSource();
    const target = createTarget();

    deriveKey(source, "COMPANIES", target, "ONLY_COMPANY", {
      mapData: (companies) =>
        companies?.length === 1 ? (companies[0] ?? null) : null,
    });

    source.update("COMPANIES", {
      isLoading: true,
      status: "Error",
      errors: [{ code: "500", message: "Boom" }],
    });

    expect(target.get("ONLY_COMPANY")().data).toBeNull();
    expect(target.get("ONLY_COMPANY")().isLoading).toBe(true);
    expect(target.get("ONLY_COMPANY")().status).toBe("Error");
    expect(target.get("ONLY_COMPANY")().errors).toEqual([
      { code: "500", message: "Boom" },
    ]);
  });

  it("should stop deriving when cleanup is called", () => {
    const source = createSource();
    const target = createTarget();

    const cleanup = deriveKey(source, "COMPANIES", target, "SINGLE", {
      mapData: (companies) => (companies?.length ?? 0) === 1,
    });

    source.update("COMPANIES", {
      data: [{ id: "c1", name: "Alice" }],
    });
    expect(target.get("SINGLE")().data).toBe(true);

    cleanup();

    source.update("COMPANIES", {
      data: [
        { id: "c1", name: "Alice" },
        { id: "c2", name: "Bob" },
      ],
    });
    expect(target.get("SINGLE")().data).toBe(true);
  });

  it("should register cleanup via destroyRef", () => {
    const source = createSource();
    const target = createTarget();
    const destroyFn = vi.fn();
    const destroyRef = {
      onDestroy: (fn: () => void) => {
        destroyFn.mockImplementation(fn);
      },
    };

    deriveKey(source, "COMPANIES", target, "SINGLE", {
      mapData: (companies) => (companies?.length ?? 0) === 1,
      destroyRef,
    });

    source.update("COMPANIES", {
      data: [{ id: "c1", name: "Alice" }],
    });
    expect(target.get("SINGLE")().data).toBe(true);

    destroyFn();

    source.update("COMPANIES", {
      data: [
        { id: "c1", name: "Alice" },
        { id: "c2", name: "Bob" },
      ],
    });
    expect(target.get("SINGLE")().data).toBe(true);
  });
});
