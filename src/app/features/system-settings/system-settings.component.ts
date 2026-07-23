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

import { catchError, of } from 'rxjs';

import { NotificationService } from '../../core/ui/notification.service';
import { SystemSettingsService } from './system-settings.service';
import type { SystemSettingResponse } from './system-settings.models';

interface SettingGroup {
  category: string;
  items: SystemSettingResponse[];
}

@Component({
  selector: 'app-system-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">System settings</h1>
      </header>

      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (error(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="fetch()">Retry</button>
        </div>
      } @else if (settings().length === 0) {
        <div class="state state--col"><p class="state__empty">No settings available.</p></div>
      } @else {
        @for (group of groups(); track group.category) {
          <p class="section-title">{{ humanize(group.category) }}</p>
          <div
            class="card"
            style="padding: 20px; display: flex; flex-direction: column; gap: 20px; margin-bottom: 24px"
          >
            @for (setting of group.items; track setting.key) {
              <div class="field">
                <span class="field__label">
                  {{ label(setting.key) }}
                  @if (setting.gatesFeatureFlag; as flag) {
                    <span class="badge badge--muted" style="margin-left: 8px">
                      gates {{ humanize(flag) }}
                    </span>
                  }
                </span>
                <span class="muted" style="font-family: var(--mono, monospace)">{{
                  setting.key
                }}</span>

                @switch (setting.type) {
                  @case ('boolean') {
                    <label class="chip" style="cursor: pointer; width: fit-content">
                      <input
                        type="checkbox"
                        [ngModel]="boolValue(setting)"
                        [disabled]="isSaving(setting.key)"
                        (ngModelChange)="onChange(setting, $event)"
                      />
                      {{ boolValue(setting) ? 'Enabled' : 'Disabled' }}
                    </label>
                  }
                  @case ('number') {
                    <input
                      class="input"
                      type="number"
                      style="max-width: 220px"
                      [attr.min]="setting.min ?? null"
                      [attr.max]="setting.max ?? null"
                      [ngModel]="numValue(setting)"
                      [disabled]="isSaving(setting.key)"
                      (ngModelChange)="onChange(setting, $event)"
                    />
                  }
                  @case ('enum') {
                    <select
                      class="input"
                      style="max-width: 320px"
                      [ngModel]="strValue(setting)"
                      [disabled]="isSaving(setting.key)"
                      (ngModelChange)="onChange(setting, $event)"
                    >
                      @for (opt of setting.enumValues ?? []; track opt) {
                        <option [value]="opt">{{ humanize(opt) }}</option>
                      }
                    </select>
                  }
                  @default {
                    @if (isLong(setting)) {
                      <textarea
                        class="input"
                        [ngModel]="strValue(setting)"
                        [disabled]="isSaving(setting.key)"
                        (ngModelChange)="onChange(setting, $event)"
                      ></textarea>
                    } @else {
                      <input
                        class="input"
                        type="text"
                        [ngModel]="strValue(setting)"
                        [disabled]="isSaving(setting.key)"
                        (ngModelChange)="onChange(setting, $event)"
                      />
                    }
                  }
                }

                @if (setting.updatedAt; as at) {
                  <span class="field__hint">Last updated {{ formatDate(at) }}</span>
                }
              </div>
            }
          </div>
        }
      }
    </section>
  `,
})
export class SystemSettingsComponent implements OnInit {
  private readonly _service = inject(SystemSettingsService);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly settings = signal<SystemSettingResponse[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly savingKeys = signal<ReadonlySet<string>>(new Set<string>());

  protected readonly groups = computed<SettingGroup[]>(() => {
    const byCategory = new Map<string, SystemSettingResponse[]>();
    for (const setting of this.settings()) {
      const bucket = byCategory.get(setting.category) ?? [];
      bucket.push(setting);
      byCategory.set(setting.category, bucket);
    }
    return [...byCategory.entries()].map(([category, items]) => ({ category, items }));
  });

  public ngOnInit(): void {
    this.fetch();
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected label(key: string): string {
    return key
      .split('.')
      .map((segment) => this.humanize(segment))
      .join(' · ');
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    return new Date(iso).toLocaleString();
  }

  protected boolValue(setting: SystemSettingResponse): boolean {
    return setting.value === true;
  }

  protected numValue(setting: SystemSettingResponse): number | null {
    return typeof setting.value === 'number' ? setting.value : null;
  }

  protected strValue(setting: SystemSettingResponse): string {
    return setting.value == null ? '' : String(setting.value);
  }

  protected isLong(setting: SystemSettingResponse): boolean {
    return this.strValue(setting).length > 60;
  }

  protected isSaving(key: string): boolean {
    return this.savingKeys().has(key);
  }

  protected onChange(setting: SystemSettingResponse, next: unknown): void {
    const key = setting.key;
    if (this.isSaving(key)) {
      return;
    }
    const previous = setting.value;
    if (next === previous) {
      return;
    }
    this._setValue(key, next);
    this._addSaving(key);
    this._service
      .update(key, next)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (updated) => {
          this._replace(key, updated);
          this._removeSaving(key);
          this._notify.success('Setting saved.');
        },
        error: (err: unknown) => {
          this._setValue(key, previous);
          this._removeSaving(key);
          const status = (err as { status?: number } | null)?.status;
          if (status === 403) {
            this._notify.error("You don't have permission to change this setting");
          } else {
            this._notify.error('Could not save the setting.');
          }
        },
      });
  }

  protected fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this._service
      .list()
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((data) => {
        this.loading.set(false);
        if (data === null) {
          this.error.set('Could not load system settings.');
          return;
        }
        this.settings.set(data);
      });
  }

  private _setValue(key: string, value: unknown): void {
    this.settings.update((list) => list.map((s) => (s.key === key ? { ...s, value } : s)));
  }

  private _replace(key: string, next: SystemSettingResponse): void {
    this.settings.update((list) => list.map((s) => (s.key === key ? next : s)));
  }

  private _addSaving(key: string): void {
    this.savingKeys.update((set) => new Set(set).add(key));
  }

  private _removeSaving(key: string): void {
    this.savingKeys.update((set) => {
      const copy = new Set(set);
      copy.delete(key);
      return copy;
    });
  }
}
