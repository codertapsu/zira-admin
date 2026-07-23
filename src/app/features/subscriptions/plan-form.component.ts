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

import { FEATURE_FLAGS, type FeatureFlag } from '../../core/api/models';
import { NotificationService } from '../../core/ui/notification.service';
import { SubscriptionsService } from './subscriptions.service';
import type { CreateSubscriptionPlanDto, UpdateSubscriptionPlanDto } from './subscriptions.models';

const PLAN_CODE_PATTERN = /^[a-z][a-z0-9_]*$/;

@Component({
  selector: 'app-plan-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="page">
      <header class="page__head">
        <h1 class="page__title">{{ isEdit() ? 'Edit plan' : 'New plan' }}</h1>
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
              <span class="field__label">Plan code</span>
              <input
                class="input"
                placeholder="pro_monthly"
                [disabled]="isEdit()"
                [ngModel]="planCode()"
                (ngModelChange)="planCode.set($event)"
              />
              <span class="field__hint">
                Lowercase letters, digits, underscore; starts with a letter. Immutable after
                creation.
              </span>
            </label>
            <label class="field">
              <span class="field__label">Display name</span>
              <input
                class="input"
                [ngModel]="displayName()"
                (ngModelChange)="displayName.set($event)"
              />
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
              <span class="field__label">Price amount (VND)</span>
              <input
                class="input"
                type="number"
                min="0"
                step="1"
                [ngModel]="priceAmount()"
                (ngModelChange)="priceAmount.set($event)"
              />
            </label>
            <label class="field">
              <span class="field__label">Currency</span>
              <input
                class="input"
                maxlength="3"
                [ngModel]="priceCurrency()"
                (ngModelChange)="priceCurrency.set($event)"
              />
            </label>
            <label class="field">
              <span class="field__label">Default duration (months)</span>
              <input
                class="input"
                type="number"
                min="1"
                max="120"
                placeholder="Leave empty for none"
                [ngModel]="defaultDurationMonths()"
                (ngModelChange)="defaultDurationMonths.set($event)"
              />
            </label>
            <label class="field">
              <span class="field__label">Sort order (0–10000)</span>
              <input
                class="input"
                type="number"
                min="0"
                max="10000"
                [ngModel]="sortOrder()"
                (ngModelChange)="sortOrder.set($event)"
              />
            </label>
          </div>

          <fieldset class="field" style="border: 0; padding: 0; margin: 0">
            <span class="field__label">Feature keys</span>
            <div class="chips">
              @for (flag of featureFlags; track flag) {
                <label class="chip" style="cursor: pointer">
                  <input
                    type="checkbox"
                    [checked]="hasFeature(flag)"
                    (change)="toggleFeature(flag, $any($event.target).checked)"
                  />
                  {{ humanize(flag) }}
                </label>
              }
            </div>
            <span class="field__hint">Features unlocked while this plan is active.</span>
          </fieldset>

          <label class="field" style="flex-direction: row; align-items: center; gap: 10px">
            <input type="checkbox" [ngModel]="isActive()" (ngModelChange)="isActive.set($event)" />
            <span class="field__label" style="margin: 0">Active (available for purchase)</span>
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
export class PlanFormComponent implements OnInit {
  private readonly _service = inject(SubscriptionsService);
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly featureFlags = FEATURE_FLAGS;

  private readonly _id = signal<string | null>(null);
  protected readonly isEdit = computed<boolean>(() => this._id() !== null);

  protected readonly planCode = signal<string>('');
  protected readonly displayName = signal<string>('');
  protected readonly description = signal<string>('');
  protected readonly priceAmount = signal<number>(0);
  protected readonly priceCurrency = signal<string>('VND');
  protected readonly defaultDurationMonths = signal<number | null>(null);
  protected readonly sortOrder = signal<number>(0);
  protected readonly featureKeys = signal<FeatureFlag[]>([]);
  protected readonly isActive = signal<boolean>(true);

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

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected hasFeature(flag: FeatureFlag): boolean {
    return this.featureKeys().includes(flag);
  }

  protected toggleFeature(flag: FeatureFlag, checked: boolean): void {
    this.featureKeys.update((list) =>
      checked ? [...new Set([...list, flag])] : list.filter((f) => f !== flag),
    );
  }

  protected back(): void {
    void this._router.navigate(['plans'], { relativeTo: this._route.parent });
  }

  protected reload(): void {
    const id = this._id();
    if (!id) {
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this._service
      .getPlan(id)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((plan) => {
        this.loading.set(false);
        if (!plan) {
          this.loadError.set('Could not load the plan.');
          return;
        }
        this.planCode.set(plan.planCode);
        this.displayName.set(plan.displayName);
        this.description.set(plan.description ?? '');
        this.priceAmount.set(plan.priceAmount);
        this.priceCurrency.set(plan.priceCurrency);
        this.defaultDurationMonths.set(plan.defaultDurationMonths);
        this.sortOrder.set(plan.sortOrder);
        this.featureKeys.set([...plan.featureKeys]);
        this.isActive.set(plan.isActive);
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
      ? this._service.updatePlan(id, this._buildUpdate())
      : this._service.createPlan(this._buildCreate());
    request$.pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this._notify.success(id ? 'Plan updated.' : 'Plan created.');
        void this._router.navigate(['plans'], { relativeTo: this._route.parent });
      },
      error: () => {
        this.saving.set(false);
        this.formError.set('Could not save the plan. Please check the fields and try again.');
      },
    });
  }

  private _validate(): string | null {
    if (!this.isEdit()) {
      const code = this.planCode().trim();
      if (code.length < 1 || code.length > 32 || !PLAN_CODE_PATTERN.test(code)) {
        return 'Plan code must be 1–32 chars: lowercase letters, digits, underscore; start with a letter.';
      }
    }
    const name = this.displayName().trim();
    if (name.length < 1 || name.length > 64) {
      return 'Display name is required (1–64 characters).';
    }
    const currency = this.priceCurrency().trim();
    if (currency.length !== 3) {
      return 'Currency must be a 3-letter code.';
    }
    const price = Number(this.priceAmount());
    if (!Number.isInteger(price) || price < 0) {
      return 'Price amount must be a whole number of 0 or more.';
    }
    const duration = this.defaultDurationMonths();
    if (
      duration !== null &&
      (!Number.isInteger(Number(duration)) || duration < 1 || duration > 120)
    ) {
      return 'Default duration must be between 1 and 120 months, or empty.';
    }
    const sort = Number(this.sortOrder());
    if (!Number.isFinite(sort) || sort < 0 || sort > 10000) {
      return 'Sort order must be between 0 and 10000.';
    }
    return null;
  }

  private _buildCreate(): CreateSubscriptionPlanDto {
    return {
      planCode: this.planCode().trim(),
      ...this._buildCommon(),
    };
  }

  private _buildUpdate(): UpdateSubscriptionPlanDto {
    return this._buildCommon();
  }

  private _buildCommon(): Omit<CreateSubscriptionPlanDto, 'planCode'> {
    const duration = this.defaultDurationMonths();
    return {
      displayName: this.displayName().trim(),
      description: this.description().trim() || null,
      priceAmount: Number(this.priceAmount()),
      priceCurrency: this.priceCurrency().trim(),
      defaultDurationMonths: duration === null ? null : Number(duration),
      featureKeys: this.featureKeys(),
      isActive: this.isActive(),
      sortOrder: Number(this.sortOrder()),
    };
  }
}
