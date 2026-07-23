import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { NotificationService } from './notification.service';

@Component({
  selector: 'app-toasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" aria-live="polite" aria-atomic="false">
      @for (toast of notifications.toasts(); track toast.id) {
        <div class="toast toast--{{ toast.kind }}" role="status">
          <span class="toast__text">{{ toast.text }}</span>
          <button
            class="toast__close"
            type="button"
            aria-label="Dismiss"
            (click)="notifications.dismiss(toast.id)"
          >
            ×
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastsComponent {
  protected readonly notifications = inject(NotificationService);
}
