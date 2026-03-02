import type { ResourceErrors } from '@flurryx/core';

export type ErrorNormalizer = (error: unknown) => ResourceErrors;

export function defaultErrorNormalizer(error: unknown): ResourceErrors {
  if (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof (error as Record<string, unknown>).error === 'object'
  ) {
    const inner = (error as { error: Record<string, unknown> }).error;
    if (inner && Array.isArray(inner.errors)) {
      return inner.errors as ResourceErrors;
    }
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    'message' in error
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
        code: 'UNKNOWN',
        message: error.message,
      },
    ];
  }

  return [
    {
      code: 'UNKNOWN',
      message: String(error),
    },
  ];
}
