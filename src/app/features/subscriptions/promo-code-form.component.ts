import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { catchError, of } from 'rxjs';

import { NotificationService } from '../../core/ui/notification.service';
import { SubscriptionsService } from './subscriptions.service';
import type { CreatePromoCodeDto, UpdatePromoCodeDto } from './subscriptions.models';

function isoToLocalInput(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

@Component({
  selector: 'app-promo-code-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="page">
      <header class="page__head">
        <h1 class="page__title">{{ isEdit() ? 'Edit promo code' : 'New promo code' }}</h1>
        <button class="btn btn--ghost btn--sm" type="button" (click)="back()">Back</button>
      </header>

      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (loadError(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="reload()">Retry</button>
        </div>
      } @else {
        <div class="card" style="padding: 20px; display: flex; flex-direction: column; gap: 20px">
          <div class="form-grid">
            <label class="field">
              <span class="field__label">Code</span>
              <input
                class="input"
                placeholder="WELCOME2026"
                [disabled]="isEdit()"
                [ngModel]="code()"
                (ngModelChange)="code.set($event)"
              />
              <span class="field__hint">Immutable after creation (1–48 characters).</span>
            </label>
            <label class="field">
              <span class="field__label">Name</span>
              <input class="input" [ngModel]="name()" (ngModelChange)="name.set($event)" />
            </label>
          </div>

          <label class="field">
            <span class="field__label">Description</span>
            <textarea
              class="input"
              [ngModel]="description()"
              (ngModelChange)="description.set($event)"
            ></textarea>
          </label>

          <div class="form-grid">
            <label class="field">
              <span class="field__label">Valid from</span>
              <input
                class="input"
                type="datetime-local"
                [ngModel]="validFrom()"
                (ngModelChange)="validFrom.set($event)"
              />
            </label>
            <label class="field">
              <span class="field__label">Valid until</span>
              <input
                class="input"
                type="datetime-local"
                [ngModel]="validUntil()"
                (ngModelChange)="validUntil.set($event)"
              />
            </label>
          </div>

          <label class="field" style="flex-direction: row; align-items: center; gap: 10px">
            <input type="checkbox" [ngModel]="isActive()" (ngModelChange)="isActive.set($event)" />
            <span class="field__label" style="margin: 0">Active</span>
          </label>

          @if (formError(); as message) {
            <p class="field__error" role="alert">{{ message }}</p>
          }

          <div class="form-actions">
            <button class="btn btn--ghost" type="button" (click)="back()">Cancel</button>
            <button class="btn btn--primary" type="button" [disabled]="saving()" (click)="submit()">
              {{ saving() ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class PromoCodeFormComponent implements OnInit {
  private readonly _service = inject(SubscriptionsService);
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  private readonly _id = signal<string | null>(null);
  protected readonly isEdit = computed<boolean>(() => this._id() !== null);

  protected readonly code = signal<string>('');
  protected readonly name = signal<string>('');
  protected readonly description = signal<string>('');
  protected readonly isActive = signal<boolean>(true);
  protected readonly validFrom = signal<string>('');
  protected readonly validUntil = signal<string>('');

  protected readonly loading = signal<boolean>(false);
  protected readonly saving = signal<boolean>(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

  public ngOnInit(): void {
    const id = this._route.snapshot.paramMap.get('id');
    this._id.set(id);
    if (id) {
      this.reload();
    }
  }

  protected back(): void {
    void this._router.navigate(['promo-codes'], { relativeTo: this._route.parent });
  }

  protected reload(): void {
    const id = this._id();
    if (!id) {
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this._service
      .getPromoCode(id)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((promo) => {
        this.loading.set(false);
        if (!promo) {
          this.loadError.set('Could not load the promo code.');
          return;
        }
        this.code.set(promo.code);
        this.name.set(promo.name);
        this.description.set(promo.description ?? '');
        this.isActive.set(promo.isActive);
        this.validFrom.set(isoToLocalInput(promo.validFrom));
        this.validUntil.set(isoToLocalInput(promo.validUntil));
      });
  }

  protected submit(): void {
    if (this.saving()) {
      return;
    }
    const error = this._validate();
    if (error) {
      this.formError.set(error);
      return;
    }
    this.formError.set(null);
    this.saving.set(true);

    const id = this._id();
    const request$ = id
      ? this._service.updatePromoCode(id, this._buildUpdate())
      : this._service.createPromoCode(this._buildCreate());
    request$.pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this._notify.success(id ? 'Promo code updated.' : 'Promo code created.');
        void this._router.navigate(['promo-codes'], { relativeTo: this._route.parent });
      },
      error: () => {
        this.saving.set(false);
        this.formError.set('Could not save the promo code. Please check the fields and try again.');
      },
    });
  }

  private _validate(): string | null {
    if (!this.isEdit()) {
      const code = this.code().trim();
      if (code.length < 1 || code.length > 48) {
        return 'Code is required (1–48 characters).';
      }
    }
    const name = this.name().trim();
    if (name.length < 1 || name.length > 128) {
      return 'Name is required (1–128 characters).';
    }
    const from = localInputToIso(this.validFrom());
    const until = localInputToIso(this.validUntil());
    if (from && until && new Date(from).getTime() > new Date(until).getTime()) {
      return '“Valid from” must be before “Valid until”.';
    }
    return null;
  }

  private _buildCreate(): CreatePromoCodeDto {
    return {
      code: this.code().trim(),
      ...this._buildCommon(),
    };
  }

  private _buildUpdate(): UpdatePromoCodeDto {
    return this._buildCommon();
  }

  private _buildCommon(): Omit<CreatePromoCodeDto, 'code'> {
    return {
      name: this.name().trim(),
      description: this.description().trim() || null,
      isActive: this.isActive(),
      validFrom: localInputToIso(this.validFrom()),
      validUntil: localInputToIso(this.validUntil()),
    };
  }
}
