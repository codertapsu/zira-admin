import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { catchError, of } from 'rxjs';

import { CampaignsService } from './campaigns.service';
import type { CampaignStats } from './campaigns.models';

@Component({
  selector: 'app-campaign-engagement',
  changeDetection: ChangeDetectionStrategy.OnPush,
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
            <span class="stat__value">{{ s.totalViews }}</span>
            <span class="stat__label">Views</span>
          </div>
          <div class="stat">
            <span class="stat__value">{{ s.seenUsers }}</span>
            <span class="stat__label">Users who saw it</span>
          </div>
          <div class="stat">
            <span class="stat__value">{{ s.dismissedUsers }}</span>
            <span class="stat__label">Users who closed it</span>
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
