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
import { Router } from '@angular/router';

import { catchError, of } from 'rxjs';

import { ConfirmService } from '../../core/ui/confirm.service';
import { NotificationService } from '../../core/ui/notification.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { CampaignsService } from './campaigns.service';
import {
  CAMPAIGN_STATUSES,
  type CampaignResponse,
  type CampaignStats,
  type CampaignStatus,
} from './campaigns.models';

@Component({
  selector: 'app-campaigns-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Campaigns</h1>
        <button class="btn btn--primary" type="button" (click)="create()">New campaign</button>
      </header>

      @if (campaignsEnabled() === false) {
        <div class="banner banner--warn">
          <span aria-hidden="true">⚠</span>
          <span>
            Delivery is globally disabled — the
            <span style="font-family: var(--mono, monospace)">campaigns.enabled</span> kill-switch
            is off in System settings. Authoring still works, but nothing reaches end users until
            it's turned back on.
          </span>
        </div>
      }

      @if (liveNow().length > 0 || upcoming().length > 0) {
        <div class="card" style="padding: 16px; display: flex; flex-direction: column; gap: 12px">
          @if (liveNow().length > 0) {
            <div>
              <p class="section-title">Live now</p>
              <div class="chips" style="margin-top: 6px">
                @for (c of liveNow(); track c.id) {
                  <span class="chip">{{ title(c) }} · {{ windowLabel(c) }}</span>
                }
              </div>
            </div>
          }
          @if (upcoming().length > 0) {
            <div>
              <p class="section-title">Upcoming</p>
              <div class="chips" style="margin-top: 6px">
                @for (c of upcoming(); track c.id) {
                  <span class="chip">{{ title(c) }} · {{ windowLabel(c) }}</span>
                }
              </div>
            </div>
          }
        </div>
      }

      <div class="toolbar">
        <input
          class="input"
          type="search"
          aria-label="Search campaigns"
          placeholder="Search title…"
          style="max-width: 260px"
          [ngModel]="search()"
          (ngModelChange)="search.set($event)"
          (keyup.enter)="fetch()"
        />
        <select
          class="input"
          aria-label="Filter by status"
          style="max-width: 180px"
          [ngModel]="status()"
          (ngModelChange)="status.set($event); fetch()"
        >
          <option value="">All statuses</option>
          @for (s of statuses; track s) {
            <option [value]="s">{{ humanize(s) }}</option>
          }
        </select>
        <button class="btn btn--sm" type="button" (click)="fetch()">Search</button>
      </div>

      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (error(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="fetch()">Retry</button>
        </div>
      } @else if (campaigns().length === 0) {
        <div class="state state--col"><p class="state__empty">No campaigns yet.</p></div>
      } @else {
        <div class="table-wrap card">
          <table class="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Audience</th>
                <th>Seen rate</th>
                <th class="table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (campaign of campaigns(); track campaign.id) {
                <tr>
                  <td>
                    <div class="table__name">{{ title(campaign) }}</div>
                    <div class="table__sub">Priority {{ campaign.priority }}</div>
                  </td>
                  <td>{{ humanize(campaign.kind) }}</td>
                  <td>
                    <span class="badge badge--{{ badgeClass(campaign.status) }}">
                      {{ humanize(campaign.status) }}
                    </span>
                  </td>
                  <td>{{ humanize(campaign.audience) }}</td>
                  <td>{{ seenRate(campaign) }}</td>
                  <td class="table__actions-col">
                    <button class="btn btn--sm btn--ghost" type="button" (click)="edit(campaign)">
                      Edit
                    </button>
                    <button
                      class="btn btn--sm btn--ghost"
                      type="button"
                      (click)="engagement(campaign)"
                    >
                      Stats
                    </button>
                    @if (campaign.status === 'draft') {
                      <button
                        class="btn btn--sm btn--ghost"
                        type="button"
                        [disabled]="flippingId() === campaign.id"
                        (click)="activate(campaign)"
                      >
                        Activate
                      </button>
                    }
                    @if (campaign.status === 'active') {
                      <button
                        class="btn btn--sm btn--ghost"
                        type="button"
                        [disabled]="flippingId() === campaign.id"
                        (click)="archive(campaign)"
                      >
                        Archive
                      </button>
                    }
                    <button
                      class="btn btn--sm btn--ghost"
                      type="button"
                      [disabled]="duplicatingId() === campaign.id"
                      (click)="duplicate(campaign)"
                    >
                      Duplicate
                    </button>
                    <button
                      class="btn btn--sm btn--danger"
                      type="button"
                      [disabled]="deletingId() === campaign.id"
                      (click)="remove(campaign)"
                    >
                      Delete
                    </button>
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
export class CampaignsListComponent implements OnInit {
  private readonly _service = inject(CampaignsService);
  private readonly _settings = inject(SystemSettingsService);
  private readonly _router = inject(Router);
  private readonly _confirm = inject(ConfirmService);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly statuses = CAMPAIGN_STATUSES;
  protected readonly search = signal<string>('');
  protected readonly status = signal<string>('');
  protected readonly campaigns = signal<CampaignResponse[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly deletingId = signal<string | null>(null);
  protected readonly flippingId = signal<string | null>(null);
  protected readonly duplicatingId = signal<string | null>(null);
  /** null while unknown/loading; the registry default is `true` (enabled). */
  protected readonly campaignsEnabled = signal<boolean | null>(null);
  protected readonly statsByCampaign = signal<Record<string, CampaignStats>>({});

  protected readonly liveNow = computed<CampaignResponse[]>(() => {
    const now = Date.now();
    return this.campaigns().filter((c) => {
      if (c.status !== 'active') {
        return false;
      }
      const startOk = !c.startsAt || new Date(c.startsAt).getTime() <= now;
      const endOk = !c.endsAt || new Date(c.endsAt).getTime() >= now;
      return startOk && endOk;
    });
  });

  protected readonly upcoming = computed<CampaignResponse[]>(() => {
    const now = Date.now();
    return this.campaigns()
      .filter((c) => !!c.startsAt && new Date(c.startsAt).getTime() > now)
      .sort(
        (a, b) =>
          new Date(a.startsAt as string).getTime() - new Date(b.startsAt as string).getTime(),
      )
      .slice(0, 5);
  });

  public ngOnInit(): void {
    this.fetch();
    this._loadKillSwitch();
  }

  protected title(campaign: CampaignResponse): string {
    return campaign.content?.vi?.title || campaign.content?.en?.title || '—';
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected badgeClass(status: string): string {
    if (status === 'active') {
      return 'ok';
    }
    return 'muted';
  }

  protected windowLabel(campaign: CampaignResponse): string {
    const fmt = (iso: string | null): string | null =>
      iso
        ? new Date(iso).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : null;
    const start = fmt(campaign.startsAt);
    const end = fmt(campaign.endsAt);
    if (start && end) {
      return `${start} → ${end}`;
    }
    if (start) {
      return `From ${start}`;
    }
    if (end) {
      return `Until ${end}`;
    }
    return 'No schedule window';
  }

  /** '—' when not active or reach is 0/unknown; '…' while the row's stats call is in flight. */
  protected seenRate(campaign: CampaignResponse): string {
    if (campaign.status !== 'active') {
      return '—';
    }
    const stats = this.statsByCampaign()[campaign.id];
    if (!stats) {
      return '…';
    }
    if (!stats.reach) {
      return '—';
    }
    return `${Math.round((stats.seenUsers / stats.reach) * 100)}%`;
  }

  protected create(): void {
    void this._router.navigate(['/campaigns/new']);
  }

  protected edit(campaign: CampaignResponse): void {
    void this._router.navigate(['/campaigns', campaign.id, 'edit']);
  }

  protected engagement(campaign: CampaignResponse): void {
    void this._router.navigate(['/campaigns', campaign.id, 'engagement']);
  }

  protected async activate(campaign: CampaignResponse): Promise<void> {
    if (this.flippingId() !== null) {
      return;
    }
    const confirmed = await this._confirm.ask({
      title: 'Activate campaign',
      message: `Publish "${this.title(campaign)}" now? It will start reaching its audience within its schedule window.`,
      confirmLabel: 'Activate',
    });
    if (!confirmed) {
      return;
    }
    this._flip(campaign, 'active');
  }

  protected archive(campaign: CampaignResponse): void {
    if (this.flippingId() !== null) {
      return;
    }
    this._flip(campaign, 'archived');
  }

  protected duplicate(campaign: CampaignResponse): void {
    if (this.duplicatingId() !== null) {
      return;
    }
    this.duplicatingId.set(campaign.id);
    this._service
      .duplicateAsDraft(campaign.id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (created) => {
          this.duplicatingId.set(null);
          this.campaigns.update((list) => [created, ...list]);
          this._notify.success('Duplicated as a new draft.');
        },
        error: () => {
          this.duplicatingId.set(null);
          this._notify.error('Could not duplicate the campaign.');
        },
      });
  }

  protected async remove(campaign: CampaignResponse): Promise<void> {
    if (this.deletingId() !== null) {
      return;
    }
    const name = this.title(campaign);
    const confirmed = await this._confirm.ask({
      title: 'Delete campaign',
      message: `Type the campaign title to confirm — this cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
      requirePhrase: name,
      consequence: `This permanently removes "${name}" and its view/engagement history.`,
    });
    if (!confirmed) {
      return;
    }
    this.deletingId.set(campaign.id);
    this._service
      .remove(campaign.id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: () => {
          this.campaigns.update((list) => list.filter((c) => c.id !== campaign.id));
          this.deletingId.set(null);
          this._notify.success('Campaign deleted.');
        },
        error: () => {
          this.deletingId.set(null);
          this._notify.error('Could not delete the campaign.');
        },
      });
  }

  protected fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this._service
      .list(this.status() || undefined, this.search().trim() || undefined)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((data) => {
        this.loading.set(false);
        if (data === null) {
          this.error.set('Could not load campaigns.');
          return;
        }
        this.campaigns.set(data);
        this.statsByCampaign.set({});
        this._loadActiveStats(data);
      });
  }

  private _flip(campaign: CampaignResponse, status: CampaignStatus): void {
    this.flippingId.set(campaign.id);
    this._service
      .update(campaign.id, { status })
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (updated) => {
          this.flippingId.set(null);
          this.campaigns.update((list) => list.map((c) => (c.id === updated.id ? updated : c)));
          this._notify.success(status === 'active' ? 'Campaign activated.' : 'Campaign archived.');
        },
        error: () => {
          this.flippingId.set(null);
          this._notify.error('Could not update the campaign status.');
        },
      });
  }

  /** Seen-rate is only meaningful for currently-active campaigns — fetch just those. */
  private _loadActiveStats(list: CampaignResponse[]): void {
    for (const campaign of list) {
      if (campaign.status !== 'active') {
        continue;
      }
      this._service
        .stats(campaign.id)
        .pipe(
          catchError(() => of(null)),
          takeUntilDestroyed(this._destroyRef),
        )
        .subscribe((stats) => {
          if (!stats) {
            return;
          }
          this.statsByCampaign.update((map) => ({ ...map, [campaign.id]: stats }));
        });
    }
  }

  private _loadKillSwitch(): void {
    this._settings
      .list()
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((settings) => {
        if (!settings) {
          return;
        }
        const setting = settings.find((s) => s.key === 'campaigns.enabled');
        this.campaignsEnabled.set(setting ? setting.value === true : true);
      });
  }
}
