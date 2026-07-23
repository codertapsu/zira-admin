import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  readonly id: number;
  readonly kind: ToastKind;
  readonly text: string;
}

/**
 * Minimal signal-based toast queue. Zoneless-safe: the signal write inside the
 * auto-dismiss timeout drives change detection. Mounted once via ToastsComponent
 * in the shell.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private _seq = 0;
  private readonly _toasts = signal<Toast[]>([]);
  public readonly toasts = this._toasts.asReadonly();

  public success(text: string): void {
    this._push('success', text);
  }

  public error(text: string): void {
    this._push('error', text);
  }

  public info(text: string): void {
    this._push('info', text);
  }

  public dismiss(id: number): void {
    this._toasts.update((list) => list.filter((toast) => toast.id !== id));
  }

  private _push(kind: ToastKind, text: string): void {
    const id = ++this._seq;
    this._toasts.update((list) => [...list, { id, kind, text }]);
    setTimeout(() => this.dismiss(id), 4500);
  }
}
