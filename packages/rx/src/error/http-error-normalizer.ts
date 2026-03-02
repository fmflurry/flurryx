import { HttpErrorResponse } from '@angular/common/http';
import type { ResourceErrors } from '@flurryx/core';
import type { ErrorNormalizer } from './error-normalizer';

export const httpErrorNormalizer: ErrorNormalizer = (
  error: unknown
): ResourceErrors => {
  if (!(error instanceof HttpErrorResponse)) {
    return [
      {
        code: 'UNKNOWN',
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
