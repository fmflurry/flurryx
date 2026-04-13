import type { StoreDeadLetterCommand, StoreDeadLetterMeta } from "@flurryx/store";

interface HttpLikeError {
  readonly status: number;
  readonly message: string;
}

function isHttpLikeError(error: unknown): error is HttpLikeError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  );
}

export function createDeadLetterMeta(
  error: unknown,
  command?: StoreDeadLetterCommand
): StoreDeadLetterMeta | undefined {
  if (!isHttpLikeError(error)) {
    return undefined;
  }

  return {
    error: error.message,
    httpStatus: error.status,
    httpMessage: error.message,
    command: command ?? null,
  };
}
