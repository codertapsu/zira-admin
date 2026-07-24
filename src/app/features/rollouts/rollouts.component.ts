import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { catchError, forkJoin, map, of, switchMap } from 'rxjs';

import type { FeatureFlag } from '../../core/api/models';
import { FEATURE_FLAGS } from '../../core/api/models';
import { ConfirmService } from '../../core/ui/confirm.service';
import { type CsvColumn, downloadCsv } from '../../core/ui/csv.util';
import { MiniChartComponent } from '../../core/ui/mini-chart.component';
import { NotificationService } from '../../core/ui/notification.service';
import type { FeatureAdoption, ProductivityTrend } from '../insights/insights.models';
import { rangePreset } from '../insights/insights-dates.util';
import type { SystemSettingResponse } from '../system-settings/system-settings.models';
import { FLAG_EVENT_PREFIXES, type RolloutRow } from './rollouts.models';
import { RolloutsService } from './rollouts.service';

const ROLLOUT_CSV_COLUMNS: readonly CsvColumn<RolloutRow>[] = [
  { key: 'flag', label: 'Feature flag', value: (r) => r.flag },
  { key: 'settingKey', label: 'Gate setting key', value: (r) => r.setting?.key ?? '' },
  {
    key: 'state',
    label: 'Gate state',
    value: (r) => (r.setting ? (r.setting.value === true ? 'enabled' : 'disabled') : 'no gate'),
  },
  { key: 'access', label: 'Access', value: (r) => r.setting?.access ?? '' },
  { key: 'totalEvents', label: '30-day events', value: (r) => (r.hasMapping ? r.totalEvents : '') },
  { key: 'activeDays', label: 'Active days', value: (r) => (r.hasMapping ? r.activeDays : '') },
];

/**
 * Feature-flag rollout console: joins the global on/off gate (a
 * `gatesFeatureFlag` system setting) with a 30-day usage snapshot for every
 * `FeatureFlag`, so an operator can see adoption before/after flipping a
 * gate without hopping between System settings and Insights. Read-mostly —
 * the only mutation is the gate toggle, which reuses the same
 * `PATCH /admin/system-settings/:key` endpoint (and blast-radius confirm
 * pattern) as the System settings page.
 */
@Component({
  selector: 'app-rollouts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MiniChartComponent],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Rollouts</h1>
      </header>

      <div class="toolbar" style="margin-bottom: 16px">
        <span class="muted">Usage window: last 30 days</span>
        <span class="toolbar__spacer"></span>
        <a class="btn btn--ghost btn--sm" routerLink="/insights/adoption">Adoption detail</a>
        <a class="btn btn--ghost btn--sm" routerLink="/system-settings">All settings</a>
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          [disabled]="rows().length === 0"
          (click)="exportCsv()"
        >
          Export CSV
        </button>
        <button class="btn btn--primary btn--sm" type="button" (click)="fetch()">
          {{ loading() ? 'Loading…' : 'Refresh' }}
        </button>
      </div>

      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (error(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="fetch()">Retry</button>
        </div>
      } @else if (rows().length === 0) {
        <div class="state state--col"><p class="state__empty">No feature flags to show.</p></div>
      } @else {
        <div class="table-wrap card">
          <table class="table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Gate</th>
                <th>30-day usage</th>
                <th>Trend</th>
                <th class="table__actions-col">Action</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.flag) {
                <tr>
                  <td>
                    <div class="table__name">{{ humanize(row.flag) }}</div>
                    <div class="table__sub mono">{{ row.flag }}</div>
                  </td>
                  <td>
                    @if (row.setting; as setting) {
                      <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap">
                        <span
                          class="badge"
                          [class.badge--ok]="boolValue(setting)"
                          [class.badge--muted]="!boolValue(setting)"
                        >
                          {{ boolValue(setting) ? 'On' : 'Off' }}
                        </span>
                        @if (setting.access === 'admin') {
                          <span class="badge badge--warn" title="Only admins can change this gate">
                            Admin only
                          </span>
                        }
                      </div>
                      <div class="table__sub mono">{{ setting.key }}</div>
                      @if (setting.updatedAt; as at) {
                        <div class="table__sub">Updated {{ formatDate(at) }}</div>
                      }
                    } @else {
                      <span class="badge badge--muted">No gate</span>
                      <div class="table__sub">Not wired to a system setting</div>
                    }
                  </td>
                  <td>
                    @if (!row.hasMapping) {
                      <span class="muted">Not tracked</span>
                    } @else {
                      <div class="stat__value" style="font-size: 18px">{{ row.totalEvents }}</div>
                      <div class="stat__sub">{{ row.activeDays }} active days</div>
                    }
                  </td>
                  <td>
                    <div style="width: 140px">
                      <app-mini-chart
                        [points]="row.sparkline"
                        type="line"
                        [height]="28"
                        [ariaLabel]="humanize(row.flag) + ' usage, last 30 days'"
                      />
                    </div>
                  </td>
                  <td class="table__actions-col">
                    @if (row.setting && row.setting.type === 'boolean') {
                      <button
                        type="button"
                        class="btn btn--sm"
                        [class.btn--danger]="boolValue(row.setting)"
                        [class.btn--primary]="!boolValue(row.setting)"
                        [disabled]="isSaving(row.setting.key)"
                        (click)="toggleGate(row)"
                      >
                        {{
                          isSaving(row.setting.key)
                            ? 'Saving…'
                            : boolValue(row.setting)
                              ? 'Disable'
                              : 'Enable'
                        }}
                      </button>
                    } @else {
                      <span class="muted">—</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
})
export class RolloutsComponent implements OnInit {
  private readonly _rollouts = inject(RolloutsService);
  private readonly _confirm = inject(ConfirmService);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly rows = signal<RolloutRow[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly savingKeys = signal<ReadonlySet<string>>(new Set<string>());

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
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  }

  protected boolValue(setting: SystemSettingResponse): boolean {
    return setting.value === true;
  }

  protected isSaving(key: string): boolean {
    return this.savingKeys().has(key);
  }

  protected exportCsv(): void {
    downloadCsv('rollouts.csv', ROLLOUT_CSV_COLUMNS, this.rows());
  }

  protected fetch(): void {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);

    const { fromDate, toDate } = rangePreset(30);

    forkJoin({
      settings: this._rollouts.settings(),
      adoption: this._rollouts.adoption(fromDate, toDate),
    })
      .pipe(
        switchMap(({ settings, adoption }) => {
          const matches = this._resolveMatches(adoption);
          const allNames = [...new Set([...matches.values()].flat())];
          const trend$ =
            allNames.length > 0
              ? this._rollouts.trend(fromDate, toDate, allNames)
              : of<ProductivityTrend>({ series: [] });
          return trend$.pipe(map((trend) => ({ settings, adoption, matches, trend })));
        }),
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((result) => {
        this.loading.set(false);
        if (!result) {
          this.error.set('Could not load the rollout console.');
          return;
        }
        this.rows.set(
          this._buildRows(result.settings, result.adoption, result.matches, result.trend),
        );
      });
  }

  protected toggleGate(row: RolloutRow): void {
    const setting = row.setting;
    if (!setting || setting.type !== 'boolean' || this.isSaving(setting.key)) {
      return;
    }
    void this._confirmAndApply(row, setting, setting.value !== true);
  }

  /**
   * Blast-radius confirm: this PATCHes the same global system setting the
   * System settings page owns, which broadcasts `system_settings_updated`
   * to ALL connected users immediately via SSE.
   */
  private async _confirmAndApply(
    row: RolloutRow,
    setting: SystemSettingResponse,
    next: boolean,
  ): Promise<void> {
    const displayLabel = this.label(setting.key);
    const turningOff = !next;
    const confirmed = await this._confirm.ask({
      title: `${turningOff ? 'Disable' : 'Enable'} "${displayLabel}"?`,
      message: `This ${turningOff ? 'disables' : 'enables'} "${displayLabel}" for ALL users immediately via SSE broadcast, gating the ${this.humanize(row.flag)} feature.`,
      confirmLabel: turningOff ? 'Disable' : 'Enable',
      danger: turningOff,
    });
    if (!confirmed) {
      return;
    }
    this._apply(setting, next);
  }

  private _apply(setting: SystemSettingResponse, next: boolean): void {
    const key = setting.key;
    const previous = setting.value;
    this._setSaving(key, true);
    this._patchSettingValue(key, next);
    this._rollouts
      .updateGate(key, next)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (updated) => {
          this._replaceSetting(key, updated);
          this._setSaving(key, false);
          this._notify.success('Setting saved.');
        },
        error: (err: unknown) => {
          this._patchSettingValue(key, previous);
          this._setSaving(key, false);
          const status = (err as { status?: number } | null)?.status;
          if (status === 403) {
            this._notify.error("You don't have permission to change this setting");
          } else {
            this._notify.error('Could not save the setting.');
          }
        },
      });
  }

  private _setSaving(key: string, saving: boolean): void {
    this.savingKeys.update((set) => {
      const copy = new Set(set);
      if (saving) {
        copy.add(key);
      } else {
        copy.delete(key);
      }
      return copy;
    });
  }

  private _patchSettingValue(key: string, value: unknown): void {
    this.rows.update((list) =>
      list.map((row) => {
        if (!row.setting || row.setting.key !== key) {
          return row;
        }
        return { ...row, setting: { ...row.setting, value } };
      }),
    );
  }

  private _replaceSetting(key: string, updated: SystemSettingResponse): void {
    this.rows.update((list) =>
      list.map((row) =>
        row.setting && row.setting.key === key ? { ...row, setting: updated } : row,
      ),
    );
  }

  /** For every flag, the real catalog event names (from feature-adoption) whose name matches one of its prefixes. */
  private _resolveMatches(adoption: FeatureAdoption): Map<FeatureFlag, string[]> {
    const matches = new Map<FeatureFlag, string[]>();
    for (const flag of FEATURE_FLAGS) {
      const prefixes = FLAG_EVENT_PREFIXES[flag];
      const names = adoption.items
        .map((item) => item.eventName)
        .filter((name) => prefixes.some((prefix) => name.startsWith(prefix)));
      matches.set(flag, names);
    }
    return matches;
  }

  private _buildRows(
    settings: SystemSettingResponse[],
    adoption: FeatureAdoption,
    matches: Map<FeatureFlag, string[]>,
    trend: ProductivityTrend,
  ): RolloutRow[] {
    const adoptionByName = new Map(adoption.items.map((item) => [item.eventName, item]));

    return FEATURE_FLAGS.map((flag) => {
      const setting = settings.find((s) => s.gatesFeatureFlag === flag) ?? null;
      const matchedNames = matches.get(flag) ?? [];
      const totalEvents = matchedNames.reduce(
        (sum, name) => sum + (adoptionByName.get(name)?.totalCount ?? 0),
        0,
      );
      const activeDays = matchedNames.reduce(
        (max, name) => Math.max(max, adoptionByName.get(name)?.daysActive ?? 0),
        0,
      );

      const byDate = new Map<string, number>();
      for (const point of trend.series) {
        if (!matchedNames.includes(point.eventName)) {
          continue;
        }
        byDate.set(point.date, (byDate.get(point.date) ?? 0) + point.count);
      }
      const sparkline = [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, value]) => ({ label: date.slice(5).replace('-', '/'), value }));

      return {
        flag,
        setting,
        hasMapping: FLAG_EVENT_PREFIXES[flag].length > 0,
        matchedEventNames: matchedNames,
        totalEvents,
        activeDays,
        sparkline,
      };
    });
  }
}
