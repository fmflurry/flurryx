import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SnackbarService } from './snackbar.service';

@Component({
  selector: 'app-snackbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message(); as msg) {
      <div class="snackbar" [attr.data-type]="msg.type" (click)="dismiss()">
        {{ msg.text }}
      </div>
    }
  `,
  styles: `
    .snackbar {
      position: fixed;
      bottom: 1.5rem;
      left: 50%;
      transform: translateX(-50%);
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      color: #fff;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      animation: slide-up 0.25s ease-out;

      &[data-type='error'] { background: #dc2626; }
      &[data-type='success'] { background: #16a34a; }
      &[data-type='info'] { background: #1e293b; }
    }

    @keyframes slide-up {
      from { opacity: 0; transform: translateX(-50%) translateY(1rem); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `,
})
export class SnackbarComponent {
  private readonly snackbar = inject(SnackbarService);

  protected readonly message = computed(() => this.snackbar.message());

  protected dismiss(): void {
    this.snackbar.dismiss();
  }
}
