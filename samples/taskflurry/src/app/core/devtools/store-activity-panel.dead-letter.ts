export interface DeadLetterMessageDisplayInput {
  readonly status: string;
  readonly error: string | null;
  readonly httpStatus?: number | null;
  readonly httpMessage?: string | null;
}

export interface DeadLetterMessageDisplay {
  readonly httpStatus: string | null;
  readonly summary: string;
  readonly detail: string;
}

const DEAD_LETTER_STATUS = 'dead-letter';
const DEFAULT_DEAD_LETTER_DETAIL = 'Dead-letter error';
const HTTP_STATUS_PATTERN = /^Http failure response for .*:\s*(\d{3})\b/i;

export function createDeadLetterMessageDisplay(
  input: DeadLetterMessageDisplayInput
): DeadLetterMessageDisplay | null {
  if (input.status !== DEAD_LETTER_STATUS) {
    return null;
  }

  const detail = input.error?.trim() || DEFAULT_DEAD_LETTER_DETAIL;
  const structuredHttpStatus =
    input.httpStatus === null || input.httpStatus === undefined
      ? null
      : String(input.httpStatus);
  const httpStatus = structuredHttpStatus ?? detail.match(HTTP_STATUS_PATTERN)?.[1] ?? null;
  const httpMessage = input.httpMessage?.trim() || null;

  return {
    httpStatus,
    summary: httpStatus === null ? detail : `HTTP ${httpStatus}`,
    detail:
      httpStatus !== null && httpMessage !== null ? `${detail} (${httpMessage})` : detail,
  };
}
