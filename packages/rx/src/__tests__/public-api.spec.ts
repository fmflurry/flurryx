import { describe, expect, it, vi } from "vitest";

vi.mock("@angular/common/http", () => ({
  HttpErrorResponse: class HttpErrorResponse extends Error {},
}));

import * as rx from "../index";
import * as rxHttp from "../http";
import { Loading } from "../decorators/loading";
import { SkipIfCached } from "../decorators/skip-if-cached";
import { defaultErrorNormalizer } from "../error/error-normalizer";
import { httpErrorNormalizer } from "../error/http-error-normalizer";
import { syncToKeyedStore } from "../operators/sync-to-keyed-store";
import { syncToStore } from "../operators/sync-to-store";

describe("@flurryx/rx public API", () => {
  it("re-exports operators, decorators, and error utilities", () => {
    expect(rx.syncToStore).toBe(syncToStore);
    expect(rx.syncToKeyedStore).toBe(syncToKeyedStore);
    expect(rx.SkipIfCached).toBe(SkipIfCached);
    expect(rx.Loading).toBe(Loading);
    expect(rx.defaultErrorNormalizer).toBe(defaultErrorNormalizer);
  });

  it("re-exports the HTTP entrypoint", () => {
    expect(rxHttp.httpErrorNormalizer).toBe(httpErrorNormalizer);
  });
});
