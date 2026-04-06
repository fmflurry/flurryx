import { HttpErrorResponse } from "@angular/common/http";
import type { ResourceErrors } from "@flurryx/core";
import type { ErrorNormalizer } from "./error-normalizer";

/**
 * Error normalizer specialized for Angular's `HttpErrorResponse`.
 *
 * Import from `@flurryx/rx/http` or the aggregate `flurryx/http` entry point to
 * keep `@angular/common/http` out of your bundle unless you actually need it.
 *
 * - If the response contains `error.errors` (array), returns it as-is.
 * - Otherwise, wraps `{ status, message }` into a single-element `ResourceErrors`.
 * - Falls back to `{ code: 'UNKNOWN', message: String(error) }` for non-HTTP errors.
 *
 * @example
 * ```ts
 * import { httpErrorNormalizer } from '@flurryx/rx/http';
 *
 * this.http.get('/api/data')
 *   .pipe(syncToStore(this.store, 'DATA', { errorNormalizer: httpErrorNormalizer }))
 *   .subscribe();
 * ```
 */
export const httpErrorNormalizer: ErrorNormalizer = (
  error: unknown
): ResourceErrors => {
  if (!(error instanceof HttpErrorResponse)) {
    return [
      {
        code: "UNKNOWN",
        message: String(error),
      },
    ];
  }

  const errors = error.error?.errors as unknown;
  if (Array.isArray(errors)) {
    return errors as ResourceErrors;
  }

  return [
    {
      code: error.status.toString(),
      message: error.message,
    },
  ];
};
