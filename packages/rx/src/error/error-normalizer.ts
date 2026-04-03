import type { ResourceErrors } from "@flurryx/core";

/**
 * Function type that converts an unknown error into the normalized `ResourceErrors` shape.
 * Plug a custom normalizer into `syncToStore` / `syncToKeyedStore` via the `errorNormalizer` option.
 */
export type ErrorNormalizer = (error: unknown) => ResourceErrors;

/**
 * Default error normalizer used by `syncToStore` and `syncToKeyedStore`.
 *
 * Handles these shapes (checked in order):
 * 1. `{ error: { errors: [...] } }` — extracts the nested array directly.
 * 2. `{ status: number, message: string }` — wraps into `[{ code, message }]`.
 * 3. `Error` instances — wraps `error.message` with code `'UNKNOWN'`.
 * 4. Anything else — `[{ code: 'UNKNOWN', message: String(error) }]`.
 *
 * @param error - The raw error from an Observable.
 * @returns Normalized `Array<{ code: string; message: string }>`.
 */
export function defaultErrorNormalizer(error: unknown): ResourceErrors {
  if (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof (error as Record<string, unknown>).error === "object"
  ) {
    const inner = (error as { error: Record<string, unknown> }).error;
    if (inner && Array.isArray(inner.errors)) {
      return inner.errors as ResourceErrors;
    }
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "message" in error
  ) {
    const typed = error as { status: number; message: string };
    return [
      {
        code: String(typed.status),
        message: typed.message,
      },
    ];
  }

  if (error instanceof Error) {
    return [
      {
        code: "UNKNOWN",
        message: error.message,
      },
    ];
  }

  return [
    {
      code: "UNKNOWN",
      message: String(error),
    },
  ];
}
