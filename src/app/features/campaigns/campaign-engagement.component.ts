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
import { ActivatedRoute, Router } from '@angular/router';

import { catchError, of } from 'rxjs';

import { type ChartPoint, MiniChartComponent } from '../../core/ui/mini-chart.component';
import { CampaignsService } from './campaigns.service';
import type { CampaignStats } from './campaigns.models';

/** Parse a `YYYY-MM-DD` day bucket as UTC (avoids a local-timezone day shift) and format it short. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

@Component({
  selector: 'app-campaign-engagement',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MiniChartComponent],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Engagement</h1>
        <button class="btn btn--ghost btn--sm" type="button" (click)="back()">Back</button>
      </header>

      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (error(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="fetch()">Retry</button>
        </div>
      } @else if (stats(); as s) {
        <div class="stat-grid">
          <div class="stat">
            <span class="stat__value">{{ s.reach }}</span>
            <span class="stat__label">Reach</span>
            <span class="stat__sub">Eligible audience size</span>
          </div>
          <div class="stat">
            <span class="stat__value">{{ s.totalViews }}</span>
            <span class="stat__label">Views</span>
          </div>
          <div class="stat">
            <span class="stat__value">{{ seenRatePct() }}%</span>
            <span class="stat__label">Seen rate</span>
            <span class="stat__sub">{{ s.seenUsers }} of {{ s.reach }} reached</span>
          </div>
          <div class="stat">
            <span class="stat__value">{{ dismissRatePct() }}%</span>
            <span class="stat__label">Dismiss rate</span>
            <span class="stat__sub">{{ s.dismissedUsers }} of {{ s.reach }} reached</span>
          </div>
        </div>

        <div class="form-grid">
          <div class="card" style="padding: 16px; display: flex; flex-direction: column; gap: 8px">
            <span class="section-title">Daily seen</span>
            <app-mini-chart
              type="line"
              [points]="seenPoints()"
              ariaLabel="Daily users who saw this campaign"
            />
          </div>
          <div class="card" style="padding: 16px; display: flex; flex-direction: column; gap: 8px">
            <span class="section-title">Daily dismissed</span>
            <app-mini-chart
              type="line"
              [points]="dismissedPoints()"
              ariaLabel="Daily users who dismissed this campaign"
            />
          </div>
        </div>
      }
    </section>
  `,
})
export class CampaignEngagementComponent implements OnInit {
  private readonly _service = inject(CampaignsService);
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _destroyRef = inject(DestroyRef);

  private _id = '';
  protected readonly stats = signal<CampaignStats | null>(null);
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);

  protected readonly seenRatePct = computed<number>(() => {
    const s = this.stats();
    if (!s || !s.reach) {
      return 0;
    }
    return Math.round((s.seenUsers / s.reach) * 100);
  });

  protected readonly dismissRatePct = computed<number>(() => {
    const s = this.stats();
    if (!s || !s.reach) {
      return 0;
    }
    return Math.round((s.dismissedUsers / s.reach) * 100);
  });

  protected readonly seenPoints = computed<ChartPoint[]>(() =>
    (this.stats()?.dailySeries ?? []).map((d) => ({ label: shortDate(d.date), value: d.seen })),
  );

  protected readonly dismissedPoints = computed<ChartPoint[]>(() =>
    (this.stats()?.dailySeries ?? []).map((d) => ({
      label: shortDate(d.date),
      value: d.dismissed,
    })),
  );

  public ngOnInit(): void {
    this._id = this._route.snapshot.paramMap.get('id') ?? '';
    this.fetch();
  }

  protected back(): void {
    void this._router.navigate(['/campaigns']);
  }

  protected fetch(): void {
    if (!this._id) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this._service
      .stats(this._id)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((data) => {
        this.loading.set(false);
        if (!data) {
          this.error.set('Could not load engagement stats.');
          return;
        }
        this.stats.set(data);
      });
  }
}
