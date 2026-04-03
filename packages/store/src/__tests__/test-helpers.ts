import type { InjectionToken } from "@angular/core";
import { inject as mockInject } from "../__mocks__/@angular/core";

type TokenWithFactory<T> = {
  description: string;
  options?: {
    factory: () => T;
  };
};

export function describeToken(token: unknown): string {
  return (token as TokenWithFactory<unknown>).description;
}

export function createFromToken<T>(token: InjectionToken<T>): T {
  return (token as unknown as TokenWithFactory<T>).options!.factory();
}

export function injectFromMock<T>(token: InjectionToken<T>): T {
  return mockInject(token as never);
}
