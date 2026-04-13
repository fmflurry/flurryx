export interface StoreDeadLetterCommand {
  readonly type: string;
  readonly payload?: unknown;
}

export interface StoreDeadLetterMeta {
  readonly error: string;
  readonly httpStatus?: number | null;
  readonly httpMessage?: string | null;
  readonly command?: StoreDeadLetterCommand | null;
}
