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

import { catchError, of } from 'rxjs';

import { ConfirmService } from '../../core/ui/confirm.service';
import { type CsvColumn, downloadCsv } from '../../core/ui/csv.util';
import { NotificationService } from '../../core/ui/notification.service';
import { BotsService } from './bots.service';
import type { AdminBotBindingResponse, BotBindingPlatform } from './bots.models';

const PAGE_LIMIT = 50;

const CSV_COLUMNS: readonly CsvColumn<AdminBotBindingResponse>[] = [
  { key: 'platform', label: 'Platform', value: (b) => b.platform },
  { key: 'projectId', label: 'Project id', value: (b) => b.projectId },
  { key: 'projectName', label: 'Project name', value: (b) => b.projectName },
  { key: 'chatId', label: 'Chat id', value: (b) => b.chatId },
  { key: 'displayName', label: 'Chat title', value: (b) => b.displayName },
  { key: 'linkedByUserId', label: 'Linked by (user id)', value: (b) => b.linkedByUserId },
  { key: 'status', label: 'Status', value: (b) => b.status },
  { key: 'linkedAt', label: 'Linked at', value: (b) => b.linkedAt },
  { key: 'disconnectedAt', label: 'Disconnected at', value: (b) => b.disconnectedAt },
];

/**
 * Read-only-ish admin inventory of Zalo/Telegram group↔project bot bindings,
 * unified across both platforms. This is DB-aware tooling that complements
 * `zira-bot-console` (which drives the raw Telegram Bot API from the browser
 * with no Zira data access) — here we see and manage the binding *rows*
 * themselves, not the bot's live chat membership.
 */
@Component({
  selector: 'app-bots',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Bots</h1>
      </header>

      <p class="muted">
        Unified inventory of Zalo and Telegram group↔project bindings. Force-unlink is a
        database-only operation — it never calls the Bot API and does not remove the bot from the
        group.
      </p>

      <div class="toolbar">
        <select
          class="input"
          aria-label="Filter by platform"
          style="max-width: 160px"
          [ngModel]="platform()"
          (ngModelChange)="platform.set($event); search()"
        >
          <option value="">All platforms</option>
          <option value="zalo">Zalo</option>
          <option value="telegram">Telegram</option>
        </select>
        <select
          class="input"
          aria-label="Filter by status"
          style="max-width: 160px"
          [ngModel]="status()"
          (ngModelChange)="status.set($event); search()"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="disconnected">Disconnected</option>
        </select>
        <input
          class="input"
          type="text"
          aria-label="Filter by project id"
          placeholder="Project id (UUID)…"
          style="max-width: 280px"
          [ngModel]="projectId()"
          (ngModelChange)="projectId.set($event)"
          (keyup.enter)="search()"
        />
        <button class="btn btn--primary btn--sm" type="button" (click)="search()">Search</button>
        <span class="toolbar__spacer"></span>
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          [disabled]="bindings().length === 0"
          (click)="exportCsv()"
        >
          Export CSV
        </button>
      </div>

      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (error(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="search()">Retry</button>
        </div>
      } @else if (bindings().length === 0) {
        <div class="state state--col"><p class="state__empty">No bot bindings found.</p></div>
      } @else {
        <div class="table-wrap card">
          <table class="table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>Project</th>
                <th>Chat</th>
                <th>Linked by</th>
                <th>Status</th>
                <th>Linked at</th>
                <th>Disconnected at</th>
                <th class="table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (b of bindings(); track b.platform + b.id) {
                <tr>
                  <td>
                    <span class="badge badge--muted">{{ humanizePlatform(b.platform) }}</span>
                  </td>
                  <td>
                    <div class="table__name">{{ b.projectName || 'Deleted project' }}</div>
                    <div class="table__sub mono">{{ b.projectId }}</div>
                    @if (!b.projectName) {
                      <span class="badge badge--muted" style="margin-top: 4px">Orphaned</span>
                    }
                  </td>
                  <td>
                    <div class="table__name">{{ b.displayName || '—' }}</div>
                    <div class="table__sub mono">{{ b.chatId }}</div>
                  </td>
                  <td>
                    @if (b.linkedByUserId) {
                      <span class="mono">{{ b.linkedByUserId }}</span>
                    } @else {
                      <span class="badge badge--muted">Orphaned</span>
                    }
                  </td>
                  <td>
                    @if (!b.disconnectedAt) {
                      <span class="badge badge--ok">Active</span>
                    } @else {
                      <span class="badge badge--muted">Disconnected</span>
                    }
                  </td>
                  <td>{{ formatDate(b.linkedAt) }}</td>
                  <td>{{ formatDate(b.disconnectedAt) }}</td>
                  <td class="table__actions-col">
                    @if (!b.disconnectedAt) {
                      <button
                        class="btn btn--sm btn--danger"
                        type="button"
                        [disabled]="unlinkingId() === b.id"
                        (click)="forceUnlink(b)"
                      >
                        {{ unlinkingId() === b.id ? 'Unlinking…' : 'Force unlink' }}
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (hasMore()) {
          <div class="page__more">
            <button
              class="btn btn--ghost btn--sm"
              type="button"
              [disabled]="loadingMore()"
              (click)="loadMore()"
            >
              {{ loadingMore() ? 'Loading…' : 'Load more' }}
            </button>
          </div>
        }
      }
    </section>
  `,
})
export class BotsComponent implements OnInit {
  private readonly _bots = inject(BotsService);
  private readonly _confirm = inject(ConfirmService);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly platform = signal<string>('');
  protected readonly status = signal<string>('');
  protected readonly projectId = signal<string>('');

  protected readonly bindings = signal<AdminBotBindingResponse[]>([]);
  protected readonly loading = signal<boolean>(false);
  protected readonly loadingMore = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly nextCursor = signal<string | null>(null);
  protected readonly hasMore = signal<boolean>(false);
  protected readonly unlinkingId = signal<string | null>(null);

  public ngOnInit(): void {
    this.search();
  }

  protected humanizePlatform(platform: BotBindingPlatform): string {
    return platform === 'telegram' ? 'Telegram' : 'Zalo';
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  }

  protected search(): void {
    this._fetch();
  }

  protected loadMore(): void {
    const cursor = this.nextCursor();
    if (cursor === null || this.loadingMore()) {
      return;
    }
    this._fetch(cursor);
  }

  protected exportCsv(): void {
    downloadCsv('bot-bindings', CSV_COLUMNS, this.bindings());
  }

  protected async forceUnlink(binding: AdminBotBindingResponse): Promise<void> {
    if (this.unlinkingId() !== null) {
      return;
    }
    const confirmed = await this._confirm.ask({
      title: 'Force-unlink bot binding',
      message: `This only removes the database binding between "${binding.displayName || binding.chatId}" and its project — it does NOT remove the bot from the group and does not call the Bot API.`,
      consequence:
        'The bot stays in the chat and keeps posting until someone removes it there directly, or a project manager re-links a new project to that group.',
      confirmLabel: 'Force unlink',
      danger: true,
    });
    if (!confirmed) {
      return;
    }
    this.unlinkingId.set(binding.id);
    this._bots
      .forceUnlink(binding.platform, binding.id)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: () => {
          this.unlinkingId.set(null);
          this._notify.success('Binding force-unlinked.');
          this.search();
        },
        error: () => {
          this.unlinkingId.set(null);
          this._notify.error('Could not force-unlink the binding.');
        },
      });
  }

  private _fetch(cursor?: string): void {
    const isInitial = cursor === undefined;
    if (isInitial) {
      this.loading.set(true);
    } else {
      this.loadingMore.set(true);
    }
    this.error.set(null);

    const platformValue = this.platform();
    const statusValue = this.status();
    const projectIdValue = this.projectId().trim();
    this._bots
      .list(
        {
          platform: platformValue ? (platformValue as 'zalo' | 'telegram') : undefined,
          status: statusValue ? (statusValue as 'active' | 'disconnected') : undefined,
          projectId: projectIdValue.length > 0 ? projectIdValue : undefined,
        },
        { cursor, limit: PAGE_LIMIT },
      )
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        this.loading.set(false);
        this.loadingMore.set(false);
        if (res === null) {
          this.error.set('Could not load bot bindings. Please try again.');
          return;
        }
        this.bindings.update((prev) => (isInitial ? res.items : [...prev, ...res.items]));
        this.nextCursor.set(res.nextCursor);
        this.hasMore.set(res.hasMore);
      });
  }
}
