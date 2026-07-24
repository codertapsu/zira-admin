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

import { ConfirmService } from '../../core/ui/confirm.service';
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
        @if (killSwitches().length > 0) {
          <p class="section-title">Kill switches</p>
          <div class="table-wrap card" style="margin-bottom: 24px">
            <table class="table">
              <thead>
                <tr>
                  <th>Setting</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th class="table__actions-col">Action</th>
                </tr>
              </thead>
              <tbody>
                @for (setting of killSwitches(); track setting.key) {
                  <tr>
                    <td>
                      <div class="table__name">{{ label(setting.key) }}</div>
                      <div class="table__sub" style="font-family: var(--mono, monospace)">
                        {{ setting.key }}
                      </div>
                      @if (setting.gatesFeatureFlag; as flag) {
                        <div class="table__sub">gates {{ humanize(flag) }}</div>
                      }
                    </td>
                    <td>
                      <span
                        class="badge"
                        [class.badge--ok]="boolValue(setting)"
                        [class.badge--muted]="!boolValue(setting)"
                      >
                        {{ boolValue(setting) ? 'Enabled' : 'Disabled' }}
                      </span>
                    </td>
                    <td class="muted">{{ formatDate(setting.updatedAt) }}</td>
                    <td class="table__actions-col">
                      <button
                        type="button"
                        class="btn btn--sm"
                        [class.btn--danger]="boolValue(setting)"
                        [class.btn--primary]="!boolValue(setting)"
                        [disabled]="isSaving(setting.key)"
                        (click)="onChange(setting, !boolValue(setting))"
                      >
                        {{
                          isSaving(setting.key)
                            ? 'Saving…'
                            : boolValue(setting)
                              ? 'Disable'
                              : 'Enable'
                        }}
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

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
  private readonly _confirm = inject(ConfirmService);
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

  /**
   * Pinned "kill switches": standalone global gates (`admin_login.enabled`,
   * `campaigns.enabled`, `telegram_group_welcome.enabled`, …) plus every
   * per-feature `*.enabled` flag and `subscription.visible`. These are
   * additionally surfaced here — unchanged in the generic category list
   * below — because flipping any of them broadcasts to every connected
   * user immediately over SSE, so they deserve a blast-radius confirm and
   * an at-a-glance status view.
   */
  protected readonly killSwitches = computed<SystemSettingResponse[]>(() =>
    this.settings().filter((setting) => this._isKillSwitch(setting)),
  );

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

    if (this._isKillSwitch(setting) && typeof next === 'boolean') {
      void this._confirmAndApply(setting, next, previous);
      return;
    }

    this._apply(setting, next, previous);
  }

  /**
   * Blast-radius gate for global kill switches: every save here broadcasts
   * `system_settings_updated` to ALL connected users immediately via SSE, so
   * confirm before applying. `admin_login.enabled` gets a stricter typed
   * confirm when turned OFF, since that is this console's own login path.
   */
  private async _confirmAndApply(
    setting: SystemSettingResponse,
    next: boolean,
    previous: unknown,
  ): Promise<void> {
    const displayLabel = this.label(setting.key);
    const turningOff = next === false;

    if (setting.key === 'admin_login.enabled' && turningOff) {
      const confirmed = await this._confirm.ask({
        title: 'Disable admin console login?',
        message: `This disables "${displayLabel}" for ALL users immediately via SSE broadcast.`,
        consequence:
          'This disables THIS console\'s login — recovery is only via the mini app Profile → "Admin console login code" page.',
        confirmLabel: 'Disable login',
        danger: true,
        requirePhrase: 'admin_login',
      });
      if (!confirmed) {
        return;
      }
    } else {
      const confirmed = await this._confirm.ask({
        title: `${turningOff ? 'Disable' : 'Enable'} "${displayLabel}"?`,
        message: `This ${turningOff ? 'disables' : 'enables'} "${displayLabel}" for ALL users immediately via SSE broadcast.`,
        confirmLabel: turningOff ? 'Disable' : 'Enable',
        danger: turningOff,
      });
      if (!confirmed) {
        return;
      }
    }

    this._apply(setting, next, previous);
  }

  private _apply(setting: SystemSettingResponse, next: unknown, previous: unknown): void {
    const key = setting.key;
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

  /**
   * A "kill switch" is any boolean global gate: the standalone ones
   * (`admin_login.enabled`, `campaigns.enabled`, `telegram_group_welcome.enabled`,
   * `telegram_group_autoleave_on_expiry.enabled`) and every per-feature
   * `*.enabled` flag (`gatesFeatureFlag` set or not), plus `subscription.visible`
   * which uses a different naming convention but is the same shape of gate.
   */
  private _isKillSwitch(setting: SystemSettingResponse): boolean {
    return (
      setting.type === 'boolean' &&
      (setting.key.endsWith('.enabled') || setting.key === 'subscription.visible')
    );
  }
}
