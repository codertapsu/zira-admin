import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly danger?: boolean;
  /**
   * When set, the confirm button stays disabled until the operator types this
   * exact phrase (e.g. a username / campaign title / purchase code). Use for
   * irreversible or financially-sensitive deletes.
   */
  readonly requirePhrase?: string;
  /** Extra red-flagged consequence text shown above the phrase input. */
  readonly consequence?: string;
}

interface ConfirmState {
  readonly options: ConfirmOptions;
  readonly resolve: (value: boolean) => void;
}

/**
 * Promise-based confirmation dialog. `ask()` resolves true/false when the user
 * chooses. Rendered by ConfirmComponent (mounted in the shell).
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly _state = signal<ConfirmState | null>(null);
  public readonly state = this._state.asReadonly();

  public ask(options: ConfirmOptions): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this._state.set({ options, resolve });
    });
  }

  public respond(value: boolean): void {
    const current = this._state();
    if (current) {
      current.resolve(value);
      this._state.set(null);
    }
  }
}
