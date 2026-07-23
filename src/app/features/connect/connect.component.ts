import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

/**
 * Sign-in screen. The operator generates a one-time code in the Zira app
 * (Profile → "Admin console login code") and pastes it here. Admin/Staff only,
 * enforced server-side by the exchange endpoint.
 */
@Component({
  selector: 'app-connect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="connect">
      <div class="connect__card card">
        <div class="connect__brand">Zira <span>Admin</span></div>
        <h1 class="connect__title">Sign in</h1>
        <p class="connect__subtitle">
          Generate a one-time login code in the Zira app under
          <strong>Profile → Admin console login code</strong>, then paste it below.
        </p>

        <label class="field">
          <span class="field__label">Login code</span>
          <input
            class="input"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="Paste your code"
            [ngModel]="code()"
            (ngModelChange)="code.set($event)"
            (keyup.enter)="submit()"
          />
        </label>

        @if (error(); as message) {
          <p class="connect__error" role="alert">{{ message }}</p>
        }

        <button
          class="btn btn--primary btn--block"
          type="button"
          [disabled]="submitting() || code().trim().length === 0"
          (click)="submit()"
        >
          {{ submitting() ? 'Signing in…' : 'Sign in' }}
        </button>
      </div>
    </div>
  `,
})
export class ConnectComponent {
  private readonly _auth = inject(AuthService);
  private readonly _router = inject(Router);

  protected readonly code = signal<string>('');
  protected readonly submitting = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  protected submit(): void {
    const value = this.code().trim();
    if (value.length === 0 || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    this._auth.exchangeCode(value).subscribe({
      next: () => {
        void this._router.navigate(['/']);
      },
      error: () => {
        this.submitting.set(false);
        this.error.set(
          'That code is invalid, expired, or already used. Generate a new one in the Zira app.',
        );
      },
    });
  }
}
