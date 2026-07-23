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

import { NotificationService } from '../../core/ui/notification.service';
import { CampaignsService } from './campaigns.service';
import {
  CAMPAIGN_AUDIENCES,
  CAMPAIGN_KINDS,
  CAMPAIGN_PLATFORMS,
  CAMPAIGN_RENOTIFY_POLICIES,
  CAMPAIGN_STATUSES,
  type CampaignAudience,
  type CampaignKind,
  type CampaignPlatform,
  type CampaignRenotifyPolicy,
  type CampaignStatus,
  type CreateCampaign,
} from './campaigns.models';

const MEDIA_URL_PATTERN = /^https?:\/\/\S+$/i;

function toLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function isoToLocalInput(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

@Component({
  selector: 'app-campaign-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">{{ isEdit() ? 'Edit campaign' : 'New campaign' }}</h1>
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
              <span class="field__label">Type</span>
              <select class="input" [ngModel]="kind()" (ngModelChange)="kind.set($event)">
                @for (k of kinds; track k) {
                  <option [value]="k">{{ humanize(k) }}</option>
                }
              </select>
            </label>
            <label class="field">
              <span class="field__label">Status</span>
              <select class="input" [ngModel]="status()" (ngModelChange)="status.set($event)">
                @for (s of statuses; track s) {
                  <option [value]="s">{{ humanize(s) }}</option>
                }
              </select>
              <span class="field__hint">Only “Active” campaigns are delivered.</span>
            </label>
          </div>

          <div class="form-grid">
            <div
              class="card"
              style="padding: 16px; display: flex; flex-direction: column; gap: 12px"
            >
              <p class="section-title">Vietnamese</p>
              <label class="field">
                <span class="field__label">Title</span>
                <input class="input" [ngModel]="viTitle()" (ngModelChange)="viTitle.set($event)" />
              </label>
              <label class="field">
                <span class="field__label">Body</span>
                <textarea
                  class="input"
                  [ngModel]="viBody()"
                  (ngModelChange)="viBody.set($event)"
                ></textarea>
              </label>
              <label class="field">
                <span class="field__label">CTA label</span>
                <input class="input" [ngModel]="viCta()" (ngModelChange)="viCta.set($event)" />
              </label>
            </div>
            <div
              class="card"
              style="padding: 16px; display: flex; flex-direction: column; gap: 12px"
            >
              <p class="section-title">English</p>
              <label class="field">
                <span class="field__label">Title</span>
                <input class="input" [ngModel]="enTitle()" (ngModelChange)="enTitle.set($event)" />
              </label>
              <label class="field">
                <span class="field__label">Body</span>
                <textarea
                  class="input"
                  [ngModel]="enBody()"
                  (ngModelChange)="enBody.set($event)"
                ></textarea>
              </label>
              <label class="field">
                <span class="field__label">CTA label</span>
                <input class="input" [ngModel]="enCta()" (ngModelChange)="enCta.set($event)" />
              </label>
            </div>
          </div>

          <label class="field">
            <span class="field__label">Image URLs</span>
            <textarea
              class="input"
              placeholder="One absolute http(s) URL per line (max 10)"
              [ngModel]="mediaUrlsText()"
              (ngModelChange)="mediaUrlsText.set($event)"
            ></textarea>
          </label>

          <label class="field">
            <span class="field__label">CTA link</span>
            <input
              class="input"
              type="url"
              placeholder="https://…"
              [ngModel]="ctaUrl()"
              (ngModelChange)="ctaUrl.set($event)"
            />
          </label>

          <div class="form-grid">
            <label class="field">
              <span class="field__label">Audience</span>
              <select class="input" [ngModel]="audience()" (ngModelChange)="audience.set($event)">
                @for (a of audiences; track a) {
                  <option [value]="a">{{ humanize(a) }}</option>
                }
              </select>
            </label>
            <label class="field">
              <span class="field__label">Re-notify</span>
              <select
                class="input"
                [ngModel]="renotifyPolicy()"
                (ngModelChange)="renotifyPolicy.set($event)"
              >
                @for (r of renotifyPolicies; track r) {
                  <option [value]="r">{{ humanize(r) }}</option>
                }
              </select>
            </label>
          </div>

          @if (audience() === 'specific_users') {
            <label class="field">
              <span class="field__label">Target user IDs</span>
              <textarea
                class="input"
                placeholder="One user id per line"
                [ngModel]="targetUserIdsText()"
                (ngModelChange)="targetUserIdsText.set($event)"
              ></textarea>
            </label>
          }

          <fieldset class="field" style="border: 0; padding: 0; margin: 0">
            <span class="field__label">Platforms</span>
            <div class="chips">
              @for (p of platformOptions; track p) {
                <label class="chip" style="cursor: pointer">
                  <input
                    type="checkbox"
                    [checked]="hasPlatform(p)"
                    (change)="togglePlatform(p, $any($event.target).checked)"
                  />
                  {{ humanize(p) }}
                </label>
              }
            </div>
            <span class="field__hint">Leave empty for all platforms.</span>
          </fieldset>

          <div class="form-grid">
            <label class="field">
              <span class="field__label">Starts at</span>
              <input
                class="input"
                type="datetime-local"
                [ngModel]="startsAt()"
                (ngModelChange)="startsAt.set($event)"
              />
            </label>
            <label class="field">
              <span class="field__label">Ends at</span>
              <input
                class="input"
                type="datetime-local"
                [ngModel]="endsAt()"
                (ngModelChange)="endsAt.set($event)"
              />
            </label>
            <label class="field">
              <span class="field__label">Priority (0–1000)</span>
              <input
                class="input"
                type="number"
                min="0"
                max="1000"
                [ngModel]="priority()"
                (ngModelChange)="priority.set($event)"
              />
            </label>
          </div>

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
    </section>
  `,
})
export class CampaignFormComponent implements OnInit {
  private readonly _service = inject(CampaignsService);
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly kinds = CAMPAIGN_KINDS;
  protected readonly statuses = CAMPAIGN_STATUSES;
  protected readonly audiences = CAMPAIGN_AUDIENCES;
  protected readonly renotifyPolicies = CAMPAIGN_RENOTIFY_POLICIES;
  protected readonly platformOptions = CAMPAIGN_PLATFORMS;

  private readonly _id = signal<string | null>(null);
  protected readonly isEdit = computed<boolean>(() => this._id() !== null);

  protected readonly kind = signal<CampaignKind>('announcement');
  protected readonly status = signal<CampaignStatus>('draft');
  protected readonly viTitle = signal<string>('');
  protected readonly viBody = signal<string>('');
  protected readonly viCta = signal<string>('');
  protected readonly enTitle = signal<string>('');
  protected readonly enBody = signal<string>('');
  protected readonly enCta = signal<string>('');
  protected readonly mediaUrlsText = signal<string>('');
  protected readonly ctaUrl = signal<string>('');
  protected readonly audience = signal<CampaignAudience>('all');
  protected readonly targetUserIdsText = signal<string>('');
  protected readonly platforms = signal<CampaignPlatform[]>([]);
  protected readonly startsAt = signal<string>('');
  protected readonly endsAt = signal<string>('');
  protected readonly renotifyPolicy = signal<CampaignRenotifyPolicy>('never');
  protected readonly priority = signal<number>(0);

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

  protected hasPlatform(platform: CampaignPlatform): boolean {
    return this.platforms().includes(platform);
  }

  protected togglePlatform(platform: CampaignPlatform, checked: boolean): void {
    this.platforms.update((list) =>
      checked ? [...new Set([...list, platform])] : list.filter((p) => p !== platform),
    );
  }

  protected back(): void {
    void this._router.navigate(['/campaigns']);
  }

  protected reload(): void {
    const id = this._id();
    if (!id) {
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
      .subscribe((campaign) => {
        this.loading.set(false);
        if (!campaign) {
          this.loadError.set('Could not load the campaign.');
          return;
        }
        this.kind.set(campaign.kind);
        this.status.set(campaign.status);
        this.viTitle.set(campaign.content.vi.title);
        this.viBody.set(campaign.content.vi.body);
        this.viCta.set(campaign.content.vi.ctaLabel ?? '');
        this.enTitle.set(campaign.content.en.title);
        this.enBody.set(campaign.content.en.body);
        this.enCta.set(campaign.content.en.ctaLabel ?? '');
        this.mediaUrlsText.set(campaign.mediaUrls.join('\n'));
        this.ctaUrl.set(campaign.ctaUrl ?? '');
        this.audience.set(campaign.audience);
        this.targetUserIdsText.set(campaign.targetUserIds.join('\n'));
        this.platforms.set([...campaign.platforms]);
        this.startsAt.set(isoToLocalInput(campaign.startsAt));
        this.endsAt.set(isoToLocalInput(campaign.endsAt));
        this.renotifyPolicy.set(campaign.renotifyPolicy);
        this.priority.set(campaign.priority);
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

    const payload = this._buildPayload();
    const id = this._id();
    const request$ = id ? this._service.update(id, payload) : this._service.create(payload);
    request$.pipe(takeUntilDestroyed(this._destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this._notify.success(id ? 'Campaign updated.' : 'Campaign created.');
        void this._router.navigate(['/campaigns']);
      },
      error: () => {
        this.saving.set(false);
        this.formError.set('Could not save the campaign. Please check the fields and try again.');
      },
    });
  }

  private _validate(): string | null {
    if (
      !this.viTitle().trim() ||
      !this.viBody().trim() ||
      !this.enTitle().trim() ||
      !this.enBody().trim()
    ) {
      return 'Title and body are required for both Vietnamese and English.';
    }
    const media = toLines(this.mediaUrlsText());
    if (media.length > 10) {
      return 'At most 10 image URLs.';
    }
    if (media.some((url) => !MEDIA_URL_PATTERN.test(url))) {
      return 'Each image line must be an absolute http(s) URL.';
    }
    if (this.audience() === 'specific_users' && toLines(this.targetUserIdsText()).length === 0) {
      return 'Add at least one target user id, or choose “All”.';
    }
    const priority = Number(this.priority());
    if (!Number.isFinite(priority) || priority < 0 || priority > 1000) {
      return 'Priority must be between 0 and 1000.';
    }
    return null;
  }

  private _buildPayload(): CreateCampaign {
    return {
      kind: this.kind(),
      status: this.status(),
      content: {
        vi: {
          title: this.viTitle().trim(),
          body: this.viBody().trim(),
          ctaLabel: this.viCta().trim() || null,
        },
        en: {
          title: this.enTitle().trim(),
          body: this.enBody().trim(),
          ctaLabel: this.enCta().trim() || null,
        },
      },
      mediaUrls: toLines(this.mediaUrlsText()),
      ctaUrl: this.ctaUrl().trim() || null,
      audience: this.audience(),
      targetUserIds: this.audience() === 'specific_users' ? toLines(this.targetUserIdsText()) : [],
      platforms: this.platforms(),
      startsAt: localInputToIso(this.startsAt()),
      endsAt: localInputToIso(this.endsAt()),
      renotifyPolicy: this.renotifyPolicy(),
      priority: Number(this.priority()),
    };
  }
}
