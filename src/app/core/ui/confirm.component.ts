import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ConfirmService } from './confirm.service';

@Component({
  selector: 'app-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    @if (confirm.state(); as state) {
      <div class="modal-backdrop" (click)="cancel()">
        <div
          class="modal"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="state.options.title"
          (click)="$event.stopPropagation()"
        >
          <h2 class="modal__title">{{ state.options.title }}</h2>
          <p class="modal__message">{{ state.options.message }}</p>
          @if (state.options.consequence; as consequence) {
            <p class="modal__consequence">{{ consequence }}</p>
          }
          @if (state.options.requirePhrase; as phrase) {
            <label class="field">
              <span class="field__label">
                Type <strong>{{ phrase }}</strong> to confirm
              </span>
              <input
                class="input"
                type="text"
                autocomplete="off"
                [ngModel]="typed()"
                (ngModelChange)="typed.set($event)"
              />
            </label>
          }
          <div class="modal__actions">
            <button class="btn btn--ghost" type="button" (click)="cancel()">
              {{ state.options.cancelLabel || 'Cancel' }}
            </button>
            <button
              class="btn"
              [class.btn--danger]="state.options.danger"
              [class.btn--primary]="!state.options.danger"
              type="button"
              [disabled]="!canConfirm()"
              (click)="cancel(true)"
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
  protected readonly typed = signal<string>('');

  protected readonly canConfirm = computed<boolean>(() => {
    const phrase = this.confirm.state()?.options.requirePhrase;
    return !phrase || this.typed().trim() === phrase.trim();
  });

  protected cancel(value = false): void {
    this.confirm.respond(value);
    this.typed.set('');
  }
}
