import { Injectable, signal } from '@angular/core';

export type SnackbarType = 'error' | 'success' | 'info';

export type SnackbarMessage = {
  readonly text: string;
  readonly type: SnackbarType;
};

const DEFAULT_DURATION_MS = 5000;

@Injectable({ providedIn: 'root' })
export class SnackbarService {
  private readonly _message = signal<SnackbarMessage | null>(null);
  private timerId: ReturnType<typeof setTimeout> | null = null;

  readonly message = this._message.asReadonly();

  show(text: string, type: SnackbarType = 'info', durationMs = DEFAULT_DURATION_MS): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
    }
    this._message.set({ text, type });
    this.timerId = setTimeout(() => {
      this._message.set(null);
      this.timerId = null;
    }, durationMs);
  }

  dismiss(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this._message.set(null);
  }
}
