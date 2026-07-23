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
import { ActivatedRoute, Router } from '@angular/router';

import { catchError, of } from 'rxjs';

import { NotificationService } from '../../core/ui/notification.service';
import { FeedbackService } from './feedback.service';
import {
  FEEDBACK_STATUSES,
  type FeedbackReplyResponse,
  type FeedbackResponse,
  type FeedbackStatus,
} from './feedback.models';

@Component({
  selector: 'app-feedback-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Feedback</h1>
        <button class="btn btn--ghost btn--sm" type="button" (click)="back()">Back</button>
      </header>

      @if (loading()) {
        <div class="state"><span class="spinner"></span></div>
      } @else if (loadError(); as message) {
        <div class="state state--col">
          <p class="state__error">{{ message }}</p>
          <button class="btn btn--primary btn--sm" type="button" (click)="reload()">Retry</button>
        </div>
      } @else if (feedback(); as item) {
        <div class="detail">
          <div class="card" style="padding: 20px; display: flex; flex-direction: column; gap: 16px">
            <div class="kv">
              <div class="kv__key">Title</div>
              <div class="kv__val">{{ item.title || '—' }}</div>
              <div class="kv__key">Type</div>
              <div class="kv__val">{{ humanize(item.type) }}</div>
              <div class="kv__key">Source</div>
              <div class="kv__val">{{ humanize(item.source) }}</div>
              <div class="kv__key">Reporter</div>
              <div class="kv__val">{{ reporter(item) }}</div>
              <div class="kv__key">Created</div>
              <div class="kv__val">{{ formatDate(item.createdAt) }}</div>
              <div class="kv__key">Updated</div>
              <div class="kv__val">{{ formatDate(item.updatedAt) }}</div>
            </div>

            <label class="field" style="max-width: 240px">
              <span class="field__label">Status</span>
              <select
                class="input"
                [disabled]="savingStatus()"
                [ngModel]="status()"
                (ngModelChange)="changeStatus($event)"
              >
                @for (s of statuses; track s) {
                  <option [value]="s">{{ humanize(s) }}</option>
                }
              </select>
            </label>

            <div>
              <p class="section-title">Message</p>
              <p class="kv__val" style="white-space: pre-wrap">{{ item.message }}</p>
            </div>
          </div>

          <div class="card" style="padding: 20px; display: flex; flex-direction: column; gap: 16px">
            <p class="section-title">Replies</p>

            @if (replies().length === 0) {
              <p class="muted">No replies yet.</p>
            } @else {
              <div style="display: flex; flex-direction: column; gap: 12px">
                @for (reply of replies(); track reply.id) {
                  <div class="card" style="padding: 12px">
                    <div class="table__sub">
                      {{ replyAuthor(reply) }} · {{ formatDate(reply.createdAt) }}
                    </div>
                    <p class="kv__val" style="white-space: pre-wrap">{{ reply.message }}</p>
                  </div>
                }
              </div>
            }

            <label class="field">
              <span class="field__label">Add a reply</span>
              <textarea
                class="input"
                placeholder="Write a reply…"
                [ngModel]="replyText()"
                (ngModelChange)="replyText.set($event)"
              ></textarea>
            </label>
            <div class="form-actions">
              <button
                class="btn btn--primary"
                type="button"
                [disabled]="sendingReply() || replyText().trim().length === 0"
                (click)="sendReply()"
              >
                {{ sendingReply() ? 'Sending…' : 'Send' }}
              </button>
            </div>
          </div>
        </div>
      }
    </section>
  `,
})
export class FeedbackDetailComponent implements OnInit {
  private readonly _service = inject(FeedbackService);
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly statuses = FEEDBACK_STATUSES;

  private readonly _id = signal<string | null>(null);

  protected readonly feedback = signal<FeedbackResponse | null>(null);
  protected readonly replies = signal<FeedbackReplyResponse[]>([]);
  protected readonly status = signal<FeedbackStatus>('new');
  protected readonly replyText = signal<string>('');

  protected readonly loading = signal<boolean>(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly savingStatus = signal<boolean>(false);
  protected readonly sendingReply = signal<boolean>(false);

  public ngOnInit(): void {
    this._id.set(this._route.snapshot.paramMap.get('id'));
    this.reload();
  }

  protected humanize(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  protected formatDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    return new Date(iso).toLocaleString();
  }

  protected reporter(item: FeedbackResponse): string {
    return item.createdBy?.displayName || '—';
  }

  protected replyAuthor(reply: FeedbackReplyResponse): string {
    return reply.createdBy?.displayName || '—';
  }

  protected back(): void {
    void this._router.navigate(['/feedback']);
  }

  protected reload(): void {
    const id = this._id();
    if (!id) {
      this.loadError.set('Missing feedback id.');
      return;
    }
    this.loading.set(true);
    this.loadError.set(null);
    this._service
      .getById(id)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((item) => {
        this.loading.set(false);
        if (!item) {
          this.loadError.set('Could not load the feedback.');
          return;
        }
        this.feedback.set(item);
        this.status.set(item.status);
        this.replies.set(item.replies ?? []);
      });
  }

  protected changeStatus(next: FeedbackStatus): void {
    const id = this._id();
    const previous = this.status();
    if (!id || next === previous || this.savingStatus()) {
      return;
    }
    this.status.set(next);
    this.savingStatus.set(true);
    this._service
      .setStatus(id, next)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (updated) => {
          this.savingStatus.set(false);
          this.feedback.set(updated);
          this.status.set(updated.status);
          this._notify.success('Status updated.');
        },
        error: () => {
          this.savingStatus.set(false);
          this.status.set(previous);
          this._notify.error('Could not update the status.');
        },
      });
  }

  protected sendReply(): void {
    const id = this._id();
    const message = this.replyText().trim();
    if (!id || message.length === 0 || this.sendingReply()) {
      return;
    }
    this.sendingReply.set(true);
    this._service
      .addReply(id, message)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (reply) => {
          this.sendingReply.set(false);
          this.replies.update((list) => [...list, reply]);
          this.replyText.set('');
          this._notify.success('Reply sent.');
        },
        error: () => {
          this.sendingReply.set(false);
          this._notify.error('Could not send the reply.');
        },
      });
  }
}
