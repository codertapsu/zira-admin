import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { catchError, of } from 'rxjs';

import { ConfirmService } from '../../core/ui/confirm.service';
import { NotificationService } from '../../core/ui/notification.service';
import { DeliveriesService } from './deliveries.service';
import {
  EVENT_ALERT_DELIVERY_STATUSES,
  OUTBOX_STATUSES,
  type DeliveryMetricsSnapshot,
  type EventAlertDeliveryRow,
  type EventAlertDeliveryStatus,
  type NotificationOk,
  type OutboxRow,
  type OutboxStatus,
} from './deliveries.models';

type DeliveriesTab = 'outbox' | 'deliveries';

@Component({
  selector: 'app-deliveries',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Deliveries</h1>
      </header>

      <!-- Backlog tile -->
      <div class="card" style="padding: 20px; margin-bottom: 16px">
        <div class="toolbar">
          <p class="section-title" style="margin: 0">Delivery backlog</p>
          <span class="toolbar__spacer"></span>
          @if (metrics(); as m) {
            <span class="muted">Snapshot taken {{ formatDate(m.takenAt) }}</span>
          }
          <button
            class="btn btn--ghost btn--sm"
            type="button"
            [disabled]="metricsLoading()"
            (click)="loadMetrics()"
          >
            {{ metricsLoading() ? 'Loading…' : 'Refresh' }}
          </button>
        </div>

        @if (metricsLoading() && !metrics()) {
          <div class="state"><span class="spinner"></span></div>
        } @else if (metricsError(); as message) {
          <div class="state state--col">
            <p class="state__error">{{ message }}</p>
            <button class="btn btn--primary btn--sm" type="button" (click)="loadMetrics()">
              Retry
            </button>
          </div>
        } @else if (metrics(); as m) {
          <div class="stat-grid" style="margin-top: 12px">
            <div class="stat">
              <span class="stat__value">{{
                counter(m, 'notification_event_alert_retry_total')
              }}</span>
              <span class="stat__label">Alert retries queued</span>
            </div>
            <div class="stat">
              <span class="stat__value">{{
                counter(m, 'notification_event_alert_terminal_failure_total')
              }}</span>
              <span class="stat__label">Alert terminal failures</span>
            </div>
            <div class="stat">
              <span class="stat__value">{{
                counter(m, 'notification_redis_parse_error_total')
              }}</span>
              <span class="stat__label">Redis parse errors</span>
            </div>
            <div class="stat">
              <span class="stat__value">{{ gauge(m, 'notification_sse_active_connections') }}</span>
              <span class="stat__label">Active SSE connections</span>
            </div>
          </div>
        }
      </div>

      <!-- Regenerate alerts for an event -->
      <div class="card" style="padding: 20px; margin-bottom: 16px">
        <p class="section-title">Regenerate alerts for an event</p>
        <p class="muted">
          Rebuilds pending future deliveries for the event. Rows already marked
          <code>sent</code> are preserved.
        </p>
        <div class="toolbar" style="margin-top: 12px">
          <label class="field" style="max-width: 320px">
            <span class="field__label">Event ID</span>
            <input
              class="input"
              placeholder="UUID"
              [ngModel]="regenerateEventId()"
              (ngModelChange)="regenerateEventId.set($event)"
              (keyup.enter)="regenerateAlerts()"
            />
          </label>
          <button
            class="btn btn--primary btn--sm"
            type="button"
            [disabled]="regenerateBusy() || !regenerateEventId().trim()"
            (click)="regenerateAlerts()"
          >
            {{ regenerateBusy() ? 'Regenerating…' : 'Regenerate' }}
          </button>
        </div>
      </div>

      <nav class="tabs" aria-label="Delivery sections">
        <button
          class="tab"
          type="button"
          [class.is-active]="tab() === 'outbox'"
          (click)="selectTab('outbox')"
        >
          Outbox
        </button>
        <button
          class="tab"
          type="button"
          [class.is-active]="tab() === 'deliveries'"
          (click)="selectTab('deliveries')"
        >
          Deliveries
        </button>
      </nav>

      @switch (tab()) {
        @case ('outbox') {
          <div class="toolbar" style="margin-top: 16px">
            <select
              class="input"
              aria-label="Filter by status"
              style="max-width: 160px"
              [ngModel]="outboxStatus()"
              (ngModelChange)="outboxStatus.set($event); searchOutbox()"
            >
              <option value="">All statuses</option>
              @for (s of outboxStatuses; track s) {
                <option [value]="s">{{ humanize(s) }}</option>
              }
            </select>
            <input
              class="input"
              placeholder="Channel (e.g. zalo_bot)"
              style="max-width: 200px"
              [ngModel]="outboxChannel()"
              (ngModelChange)="outboxChannel.set($event)"
              (keyup.enter)="searchOutbox()"
            />
            <input
              class="input"
              placeholder="Recipient user ID"
              style="max-width: 260px"
              [ngModel]="outboxRecipientUserId()"
              (ngModelChange)="outboxRecipientUserId.set($event)"
              (keyup.enter)="searchOutbox()"
            />
            <button class="btn btn--primary btn--sm" type="button" (click)="searchOutbox()">
              Search
            </button>
          </div>

          @if (outboxLoading()) {
            <div class="state"><span class="spinner"></span></div>
          } @else if (outboxError(); as message) {
            <div class="state state--col">
              <p class="state__error">{{ message }}</p>
              <button class="btn btn--primary btn--sm" type="button" (click)="searchOutbox()">
                Retry
              </button>
            </div>
          } @else if (outboxRows().length === 0) {
            <div class="state state--col"><p class="state__empty">No outbox rows found.</p></div>
          } @else {
            <div class="table-wrap card">
              <table class="table">
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Channel</th>
                    <th>Event type</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Last error</th>
                    <th>Next attempt</th>
                    <th class="table__actions-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of outboxRows(); track row.id) {
                    <tr>
                      <td>
                        <a [routerLink]="['/users', row.recipientUserId]">{{
                          row.recipientUserId
                        }}</a>
                      </td>
                      <td>{{ row.channel }}</td>
                      <td>{{ humanize(row.eventType) }}</td>
                      <td>
                        <span class="badge badge--{{ row.status === 'sent' ? 'ok' : 'muted' }}">{{
                          humanize(row.status)
                        }}</span>
                      </td>
                      <td>{{ row.attempts }}</td>
                      <td>
                        @if (row.lastError) {
                          <span style="color: var(--danger)">{{ row.lastError }}</span>
                        } @else {
                          <span class="muted">—</span>
                        }
                      </td>
                      <td>{{ formatDate(row.nextAttemptAt) }}</td>
                      <td class="table__actions-col">
                        <button
                          class="btn btn--ghost btn--sm"
                          type="button"
                          [disabled]="outboxBusyId() === row.id || row.status === 'sent'"
                          (click)="requeueOutbox(row)"
                        >
                          Requeue
                        </button>
                        <button
                          class="btn btn--danger btn--sm"
                          type="button"
                          [disabled]="outboxBusyId() === row.id || row.status === 'sent'"
                          (click)="cancelOutbox(row)"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            @if (outboxHasMore()) {
              <div class="page__more">
                <button
                  class="btn btn--ghost btn--sm"
                  type="button"
                  [disabled]="outboxLoadingMore()"
                  (click)="loadMoreOutbox()"
                >
                  {{ outboxLoadingMore() ? 'Loading…' : 'Load more' }}
                </button>
              </div>
            }
          }
        }

        @case ('deliveries') {
          <div class="toolbar" style="margin-top: 16px">
            <select
              class="input"
              aria-label="Filter by status"
              style="max-width: 160px"
              [ngModel]="deliveryStatus()"
              (ngModelChange)="deliveryStatus.set($event); searchDeliveries()"
            >
              <option value="">All statuses</option>
              @for (s of deliveryStatuses; track s) {
                <option [value]="s">{{ humanize(s) }}</option>
              }
            </select>
            <input
              class="input"
              placeholder="Recipient user ID"
              style="max-width: 260px"
              [ngModel]="deliveryRecipientUserId()"
              (ngModelChange)="deliveryRecipientUserId.set($event)"
              (keyup.enter)="searchDeliveries()"
            />
            <input
              class="input"
              placeholder="Event ID"
              style="max-width: 260px"
              [ngModel]="deliveryEventId()"
              (ngModelChange)="deliveryEventId.set($event)"
              (keyup.enter)="searchDeliveries()"
            />
            <button class="btn btn--primary btn--sm" type="button" (click)="searchDeliveries()">
              Search
            </button>
          </div>

          @if (deliveriesLoading()) {
            <div class="state"><span class="spinner"></span></div>
          } @else if (deliveriesError(); as message) {
            <div class="state state--col">
              <p class="state__error">{{ message }}</p>
              <button class="btn btn--primary btn--sm" type="button" (click)="searchDeliveries()">
                Retry
              </button>
            </div>
          } @else if (deliveryRows().length === 0) {
            <div class="state state--col"><p class="state__empty">No deliveries found.</p></div>
          } @else {
            <div class="table-wrap card">
              <table class="table">
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Alert type</th>
                    <th>Occurrence</th>
                    <th>Scheduled</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Last error</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of deliveryRows(); track row.id) {
                    <tr>
                      <td>
                        <a [routerLink]="['/users', row.recipientUserId]">{{
                          row.recipientUserId
                        }}</a>
                      </td>
                      <td>{{ humanize(row.alertType) }}</td>
                      <td>{{ formatDate(row.occurrenceStartAt) }}</td>
                      <td>{{ formatDate(row.scheduledAt) }}</td>
                      <td>
                        <span class="badge badge--{{ row.status === 'sent' ? 'ok' : 'muted' }}">{{
                          humanize(row.status)
                        }}</span>
                      </td>
                      <td>{{ row.attempts }}</td>
                      <td>
                        @if (row.lastError) {
                          <span style="color: var(--danger)">{{ row.lastError }}</span>
                        } @else {
                          <span class="muted">—</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            @if (deliveriesHasMore()) {
              <div class="page__more">
                <button
                  class="btn btn--ghost btn--sm"
                  type="button"
                  [disabled]="deliveriesLoadingMore()"
                  (click)="loadMoreDeliveries()"
                >
                  {{ deliveriesLoadingMore() ? 'Loading…' : 'Load more' }}
                </button>
              </div>
            }
          }
        }
      }
    </section>
  `,
})
export class DeliveriesComponent implements OnInit {
  private readonly _deliveries = inject(DeliveriesService);
  private readonly _confirm = inject(ConfirmService);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly outboxStatuses = OUTBOX_STATUSES;
  protected readonly deliveryStatuses = EVENT_ALERT_DELIVERY_STATUSES;

  protected readonly tab = signal<DeliveriesTab>('outbox');
  private _deliveriesLoaded = false;

  // Backlog tile
  protected readonly metrics = signal<DeliveryMetricsSnapshot | null>(null);
  protected readonly metricsLoading = signal<boolean>(false);
  protected readonly metricsError = signal<string | null>(null);

  // Regenerate action
  protected readonly regenerateEventId = signal<string>('');
  protected readonly regenerateBusy = signal<boolean>(false);

  // Outbox tab
  protected readonly outboxStatus = signal<string>('');
  protected readonly outboxChannel = signal<string>('');
  protected readonly outboxRecipientUserId = signal<string>('');
  protected readonly outboxRows = signal<OutboxRow[]>([]);
  protected readonly outboxLoading = signal<boolean>(false);
  protected readonly outboxLoadingMore = signal<boolean>(false);
  protected readonly outboxError = signal<string | null>(null);
  protected readonly outboxNextCursor = signal<string | null>(null);
  protected readonly outboxHasMore = signal<boolean>(false);
  protected readonly outboxBusyId = signal<string | null>(null);

  // Deliveries tab
  protected readonly deliveryStatus = signal<string>('');
  protected readonly deliveryRecipientUserId = signal<string>('');
  protected readonly deliveryEventId = signal<string>('');
  protected readonly deliveryRows = signal<EventAlertDeliveryRow[]>([]);
  protected readonly deliveriesLoading = signal<boolean>(false);
  protected readonly deliveriesLoadingMore = signal<boolean>(false);
  protected readonly deliveriesError = signal<string | null>(null);
  protected readonly deliveriesNextCursor = signal<string | null>(null);
  protected readonly deliveriesHasMore = signal<boolean>(false);

  public ngOnInit(): void {
    this.loadMetrics();
    this._fetchOutbox();
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  }

  protected counter(snapshot: DeliveryMetricsSnapshot, key: string): number {
    return snapshot.counters[key] ?? 0;
  }

  protected gauge(snapshot: DeliveryMetricsSnapshot, key: string): number {
    return snapshot.gauges[key] ?? 0;
  }

  protected selectTab(next: DeliveriesTab): void {
    this.tab.set(next);
    if (next === 'deliveries' && !this._deliveriesLoaded) {
      this._fetchDeliveries();
    }
  }

  protected loadMetrics(): void {
    if (this.metricsLoading()) {
      return;
    }
    this.metricsLoading.set(true);
    this.metricsError.set(null);
    this._deliveries
      .metrics()
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((data) => {
        this.metricsLoading.set(false);
        if (!data) {
          this.metricsError.set('Could not load the delivery backlog.');
          return;
        }
        this.metrics.set(data);
      });
  }

  protected async regenerateAlerts(): Promise<void> {
    const eventId = this.regenerateEventId().trim();
    if (!eventId || this.regenerateBusy()) {
      return;
    }
    const confirmed = await this._confirm.ask({
      title: 'Regenerate alerts',
      message:
        'This rebuilds pending future deliveries for the event. Rows already sent are preserved.',
      confirmLabel: 'Regenerate',
    });
    if (!confirmed) {
      return;
    }
    this.regenerateBusy.set(true);
    this._deliveries
      .regenerateEventAlerts(eventId)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: () => {
          this.regenerateBusy.set(false);
          this._notify.success('Alerts regenerated for the event.');
          if (this.tab() === 'deliveries' && this.deliveryEventId().trim() === eventId) {
            this._fetchDeliveries();
          }
        },
        error: () => {
          this.regenerateBusy.set(false);
          this._notify.error('Could not regenerate alerts for the event.');
        },
      });
  }

  protected searchOutbox(): void {
    this._fetchOutbox();
  }

  protected loadMoreOutbox(): void {
    const cursor = this.outboxNextCursor();
    if (cursor === null || this.outboxLoadingMore()) {
      return;
    }
    this._fetchOutbox(cursor);
  }

  protected async requeueOutbox(row: OutboxRow): Promise<void> {
    if (this.outboxBusyId()) {
      return;
    }
    const confirmed = await this._confirm.ask({
      title: 'Requeue delivery',
      message: 'The row flips back to pending and becomes eligible for delivery immediately.',
      confirmLabel: 'Requeue',
    });
    if (!confirmed) {
      return;
    }
    this.outboxBusyId.set(row.id);
    this._deliveries
      .requeueOutbox(row.id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (result) => {
          this.outboxBusyId.set(null);
          this._applyOutboxResult(row.id, result, 'pending');
          this._notify.success('Delivery requeued.');
        },
        error: () => {
          this.outboxBusyId.set(null);
          this._notify.error('Could not requeue the delivery.');
        },
      });
  }

  protected async cancelOutbox(row: OutboxRow): Promise<void> {
    if (this.outboxBusyId()) {
      return;
    }
    const confirmed = await this._confirm.ask({
      title: 'Cancel delivery',
      message:
        'The row is parked as failed so the dispatcher stops retrying it. The row is retained for audit — nothing is deleted.',
      confirmLabel: 'Cancel delivery',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.outboxBusyId.set(row.id);
    this._deliveries
      .cancelOutbox(row.id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (result) => {
          this.outboxBusyId.set(null);
          this._applyOutboxResult(row.id, result, 'failed');
          this._notify.success('Delivery canceled.');
        },
        error: () => {
          this.outboxBusyId.set(null);
          this._notify.error('Could not cancel the delivery.');
        },
      });
  }

  protected searchDeliveries(): void {
    this._fetchDeliveries();
  }

  protected loadMoreDeliveries(): void {
    const cursor = this.deliveriesNextCursor();
    if (cursor === null || this.deliveriesLoadingMore()) {
      return;
    }
    this._fetchDeliveries(cursor);
  }

  private _fetchOutbox(cursor?: string): void {
    const isInitial = cursor === undefined;
    if (isInitial) {
      this.outboxLoading.set(true);
    } else {
      this.outboxLoadingMore.set(true);
    }
    this.outboxError.set(null);

    const status = this.outboxStatus();
    const channel = this.outboxChannel().trim();
    const recipientUserId = this.outboxRecipientUserId().trim();

    this._deliveries
      .listOutbox(
        {
          status: status === '' ? undefined : (status as OutboxStatus),
          channel: channel.length > 0 ? channel : undefined,
          recipientUserId: recipientUserId.length > 0 ? recipientUserId : undefined,
        },
        cursor,
        50,
      )
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this.outboxLoading.set(false);
        this.outboxLoadingMore.set(false);
        if (res === null) {
          this.outboxError.set('Could not load the outbox. Please try again.');
          return;
        }
        this.outboxRows.update((prev) => (isInitial ? res.items : [...prev, ...res.items]));
        this.outboxNextCursor.set(res.nextCursor);
        this.outboxHasMore.set(res.hasMore);
      });
  }

  private _fetchDeliveries(cursor?: string): void {
    this._deliveriesLoaded = true;
    const isInitial = cursor === undefined;
    if (isInitial) {
      this.deliveriesLoading.set(true);
    } else {
      this.deliveriesLoadingMore.set(true);
    }
    this.deliveriesError.set(null);

    const status = this.deliveryStatus();
    const recipientUserId = this.deliveryRecipientUserId().trim();
    const eventId = this.deliveryEventId().trim();

    this._deliveries
      .listEventAlertDeliveries(
        {
          status: status === '' ? undefined : (status as EventAlertDeliveryStatus),
          recipientUserId: recipientUserId.length > 0 ? recipientUserId : undefined,
          eventId: eventId.length > 0 ? eventId : undefined,
        },
        cursor,
        50,
      )
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this.deliveriesLoading.set(false);
        this.deliveriesLoadingMore.set(false);
        if (res === null) {
          this.deliveriesError.set('Could not load deliveries. Please try again.');
          return;
        }
        this.deliveryRows.update((prev) => (isInitial ? res.items : [...prev, ...res.items]));
        this.deliveriesNextCursor.set(res.nextCursor);
        this.deliveriesHasMore.set(res.hasMore);
      });
  }

  private _applyOutboxResult(
    id: string,
    result: OutboxRow | NotificationOk,
    fallbackStatus: OutboxStatus,
  ): void {
    this.outboxRows.update((rows) =>
      rows.map((row) => {
        if (row.id !== id) {
          return row;
        }
        return 'status' in result ? result : { ...row, status: fallbackStatus };
      }),
    );
  }
}
