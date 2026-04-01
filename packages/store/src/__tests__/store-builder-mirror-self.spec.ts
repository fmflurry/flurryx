import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@angular/core", async () => {
  return import("../__mocks__/@angular/core");
});

import { _resetProviders } from "../__mocks__/@angular/core";
import { Store } from "../store-builder";
import type { IStore, ConfigToData } from "../types";
import type { InjectionToken } from "@angular/core";
import { createFromToken, injectFromMock } from "./test-helpers";

interface Customer {
  id: string;
  name: string;
}

type CustomerStoreConfig = Record<"CUSTOMERS", Customer[]>;

const CustomerStore = Store.for<CustomerStoreConfig>().build();

type SourceTargetData = ConfigToData<Record<"SOURCE" | "TARGET", string>>;

type ConstrainedMirrorSelfStageOne = {
  resource: (key: "SOURCE" | "TARGET") => {
    as: () => ConstrainedMirrorSelfStageTwo;
  };
};

type ConstrainedMirrorSelfStageTwo = {
  resource: (key: "SOURCE" | "TARGET") => {
    as: () => ConstrainedMirrorSelfFinalStage;
  };
};

type ConstrainedMirrorSelfFinalStage = {
  mirrorSelf: (
    sourceKey: "SOURCE" | "TARGET",
    targetKey: "SOURCE" | "TARGET"
  ) => {
    build: () => InjectionToken<IStore<SourceTargetData>>;
  };
};

function createConstrainedMirrorSelfToken(
  sourceKey: "SOURCE" | "TARGET",
  targetKey: "SOURCE" | "TARGET"
) {
  const SessionEnum = {
    SOURCE: "SOURCE",
    TARGET: "TARGET",
  } as const;

  const stageOne = Store.for(
    SessionEnum
  ) as unknown as ConstrainedMirrorSelfStageOne;
  const stageTwo = stageOne.resource("SOURCE").as();
  const finalStage = stageTwo.resource("TARGET").as();

  return finalStage.mirrorSelf(sourceKey, targetKey).build();
}

beforeEach(() => {
  _resetProviders();
});

describe("Store builder .mirrorSelf()", () => {
  describe("unconstrained builder", () => {
    it("should mirror one store key to another key on the same store", () => {
      const SessionStore = Store.resource("SOURCE")
        .as<string>()
        .resource("TARGET")
        .as<string>()
        .mirrorSelf("SOURCE", "TARGET")
        .build();

      const sessionStore = createFromToken(SessionStore);

      sessionStore.update("SOURCE", {
        data: "hello",
        status: "Success",
        isLoading: false,
      });

      expect(sessionStore.get("TARGET")().data).toBe("hello");
      expect(sessionStore.get("TARGET")().status).toBe("Success");
      expect(sessionStore.get("TARGET")().isLoading).toBe(false);
    });

    it("should clear the target key when the source key is cleared", () => {
      const SessionStore = Store.resource("SOURCE")
        .as<string>()
        .resource("TARGET")
        .as<string>()
        .mirrorSelf("SOURCE", "TARGET")
        .build();

      const sessionStore = createFromToken(SessionStore);

      sessionStore.update("SOURCE", {
        data: "hello",
        status: "Success",
      });

      sessionStore.clear("SOURCE");

      expect(sessionStore.get("TARGET")()).toEqual({
        data: undefined,
        isLoading: false,
        status: undefined,
        errors: undefined,
      });
    });
  });

  describe("interface-based builder", () => {
    it("should react to updates coming from another mirror before self mirroring", () => {
      type SessionStoreConfig = Record<
        "CUSTOMERS" | "CUSTOMER_COPY",
        Customer[]
      >;

      const SessionStore = Store.for<SessionStoreConfig>()
        .mirror(CustomerStore, "CUSTOMERS")
        .mirrorSelf("CUSTOMERS", "CUSTOMER_COPY")
        .build();

      const customerStore = injectFromMock(CustomerStore);
      const sessionStore = createFromToken(SessionStore);

      customerStore.update("CUSTOMERS", {
        data: [{ id: "c1", name: "Alice" }],
        status: "Success",
      });

      expect(sessionStore.get("CUSTOMERS")().data).toEqual([
        { id: "c1", name: "Alice" },
      ]);
      expect(sessionStore.get("CUSTOMER_COPY")().data).toEqual([
        { id: "c1", name: "Alice" },
      ]);
    });
  });

  describe("validation", () => {
    it("should mirror loading and error state to another key", () => {
      type SessionStoreConfig = Record<"SOURCE" | "TARGET", string>;

      const SessionStore = Store.for<SessionStoreConfig>()
        .mirrorSelf("SOURCE", "TARGET")
        .build();

      const sessionStore = createFromToken(SessionStore);

      sessionStore.update("SOURCE", {
        isLoading: true,
        status: "Error",
        errors: [{ code: "500", message: "Boom" }],
      });

      expect(sessionStore.get("TARGET")().isLoading).toBe(true);
      expect(sessionStore.get("TARGET")().status).toBe("Error");
      expect(sessionStore.get("TARGET")().errors).toEqual([
        { code: "500", message: "Boom" },
      ]);
    });

    it("should reject mirroring a key to itself", () => {
      type SessionStoreConfig = Record<"SOURCE", string>;

      const SessionStore = Store.for<SessionStoreConfig>()
        .mirrorSelf("SOURCE", "SOURCE")
        .build();

      expect(() => createFromToken(SessionStore)).toThrowError(
        "mirrorSelf source and target keys must be different"
      );
    });
  });

  describe("constrained builder", () => {
    it("should mirror on enum-constrained builders", () => {
      const SessionStore = createConstrainedMirrorSelfToken("SOURCE", "TARGET");

      const sessionStore = createFromToken(SessionStore);

      sessionStore.update("SOURCE", {
        data: "value-from-constrained-builder",
        status: "Success",
      });

      expect(sessionStore.get("TARGET")().data).toBe(
        "value-from-constrained-builder"
      );
      expect(sessionStore.get("TARGET")().status).toBe("Success");
    });
  });
});
