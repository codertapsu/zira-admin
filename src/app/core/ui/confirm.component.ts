import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ConfirmService } from './confirm.service';

@Component({
  selector: 'app-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (confirm.state(); as state) {
      <div class="modal-backdrop" (click)="confirm.respond(false)">
        <div
          class="modal"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="state.options.title"
          (click)="$event.stopPropagation()"
        >
          <h2 class="modal__title">{{ state.options.title }}</h2>
          <p class="modal__message">{{ state.options.message }}</p>
          <div class="modal__actions">
            <button class="btn btn--ghost" type="button" (click)="confirm.respond(false)">
              {{ state.options.cancelLabel || 'Cancel' }}
            </button>
            <button
              class="btn"
              [class.btn--danger]="state.options.danger"
              [class.btn--primary]="!state.options.danger"
              type="button"
              (click)="confirm.respond(true)"
            >
              {{ state.options.confirmLabel || 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmComponent {
  protected readonly confirm = inject(ConfirmService);
}
