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

import type { UserSummary } from '../../core/api/models';
import { ImageInputComponent } from '../../core/ui/image-input.component';
import { NotificationService } from '../../core/ui/notification.service';
import { UsersService } from '../users/users.service';
import { CampaignAudiencePickerComponent } from './campaign-audience-picker.component';
import { CampaignPreviewComponent } from './campaign-preview.component';
import { CampaignsService } from './campaigns.service';
import { SectionSpacingComponent } from './section-spacing.component';
import {
  CAMPAIGN_ALIGNS,
  CAMPAIGN_AUDIENCES,
  CAMPAIGN_KINDS,
  CAMPAIGN_LAYOUTS,
  CAMPAIGN_MEDIA_TYPES,
  CAMPAIGN_PLATFORMS,
  CAMPAIGN_RENOTIFY_POLICIES,
  CAMPAIGN_STATUSES,
  cloneDefaultSections,
  DEFAULT_SECTION_ORDER,
  type CampaignAlign,
  type CampaignAudience,
  type CampaignKind,
  type CampaignLayout,
  type CampaignMediaType,
  type CampaignPlatform,
  type CampaignRenotifyPolicy,
  type CampaignSectionKey,
  type CampaignSections,
  type CampaignStatus,
  type CreateCampaign,
  type SectionSpacing,
} from './campaigns.models';

const IMAGE_URL_PATTERN = /^https?:\/\/\S+$/i;

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

interface SectionRow {
  key: CampaignSectionKey;
  label: string;
}

@Component({
  selector: 'app-campaign-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ImageInputComponent,
    CampaignPreviewComponent,
    SectionSpacingComponent,
    CampaignAudiencePickerComponent,
  ],
  template: `
    <section class="page" style="max-width: none">
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
        <div class="campaign-editor">
          <!-- ===================== FORM ===================== -->
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

            <!-- Layout & style -->
            <div class="field">
              <span class="field__label">Layout template</span>
              <div class="tabs" role="tablist" aria-label="Layout template">
                @for (l of layouts; track l) {
                  <button
                    type="button"
                    class="tab"
                    [class.is-active]="layout() === l"
                    (click)="layout.set(l)"
                  >
                    {{ humanize(l) }}
                  </button>
                }
              </div>
              <span class="field__hint">{{ layoutHint() }}</span>
            </div>

            <div class="form-grid">
              <label class="field">
                <span class="field__label">Title alignment</span>
                <select
                  class="input"
                  [ngModel]="titleAlign()"
                  (ngModelChange)="titleAlign.set($event)"
                >
                  @for (a of aligns; track a) {
                    <option [value]="a">{{ humanize(a) }}</option>
                  }
                </select>
              </label>
              <label class="field">
                <span class="field__label">Body alignment</span>
                <select
                  class="input"
                  [ngModel]="bodyAlign()"
                  (ngModelChange)="bodyAlign.set($event)"
                >
                  @for (a of aligns; track a) {
                    <option [value]="a">{{ humanize(a) }}</option>
                  }
                </select>
              </label>
              <label class="field">
                <span class="field__label">Icon alignment</span>
                <select
                  class="input"
                  [ngModel]="iconAlign()"
                  (ngModelChange)="iconAlign.set($event)"
                >
                  @for (a of aligns; track a) {
                    <option [value]="a">{{ humanize(a) }}</option>
                  }
                </select>
              </label>
            </div>

            <div class="field">
              <span class="field__label">Top icon</span>
              <app-image-input
                label="Top icon URL"
                placeholder="https://… or upload"
                [value]="iconUrl()"
                (valueChange)="iconUrl.set($event)"
              />
            </div>

            <div class="field">
              <span class="field__label">Main media</span>
              <div class="tabs" role="tablist" aria-label="Media type" style="margin-bottom: 8px">
                @for (t of mediaTypes; track t) {
                  <button
                    type="button"
                    class="tab"
                    [class.is-active]="mediaType() === t"
                    (click)="mediaType.set(t)"
                  >
                    {{ humanize(t) }}
                  </button>
                }
              </div>
              <app-image-input
                [kind]="mediaType()"
                [label]="mediaType() === 'video' ? 'Video URL' : 'Image URL'"
                placeholder="https://… or upload"
                [value]="primaryImage()"
                (valueChange)="primaryImage.set($event)"
              />
              <span class="field__hint">Shown as a banner (Hero) or inline (Standard).</span>
            </div>

            <!-- Localized content -->
            <div class="form-grid">
              <div
                class="card"
                style="padding: 16px; display: flex; flex-direction: column; gap: 12px"
              >
                <p class="section-title">Vietnamese</p>
                <label class="field">
                  <span class="field__label">Title</span>
                  <input
                    class="input"
                    [ngModel]="viTitle()"
                    (ngModelChange)="viTitle.set($event)"
                  />
                </label>
                <label class="field">
                  <span class="field__label">Body (HTML)</span>
                  <textarea
                    class="input"
                    rows="6"
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
                  <input
                    class="input"
                    [ngModel]="enTitle()"
                    (ngModelChange)="enTitle.set($event)"
                  />
                </label>
                <label class="field">
                  <span class="field__label">Body (HTML)</span>
                  <textarea
                    class="input"
                    rows="6"
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
            <span class="field__hint muted">
              Body supports rich HTML — e.g. &lt;b&gt;, &lt;a href&gt;, &lt;ul&gt;&lt;li&gt;,
              &lt;br&gt;, &lt;img&gt;. It is sanitized before display.
            </span>

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
              <div class="field">
                <span class="field__label">Target users</span>
                <app-campaign-audience-picker
                  [selected]="audienceUsers()"
                  (selectedChange)="audienceUsers.set($event)"
                />
              </div>
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
              <button
                class="btn btn--primary"
                type="button"
                [disabled]="saving()"
                (click)="submit()"
              >
                {{ saving() ? 'Saving…' : 'Save' }}
              </button>
            </div>
          </div>

          <!-- ===================== PREVIEW ===================== -->
          <aside class="preview-pane">
            <div class="toolbar">
              <span class="section-title">Preview</span>
              <div class="toolbar__spacer"></div>
              <div class="tabs" role="tablist" aria-label="Preview language">
                <button
                  type="button"
                  class="tab"
                  [class.is-active]="previewLang() === 'vi'"
                  (click)="previewLang.set('vi')"
                >
                  VI
                </button>
                <button
                  type="button"
                  class="tab"
                  [class.is-active]="previewLang() === 'en'"
                  (click)="previewLang.set('en')"
                >
                  EN
                </button>
              </div>
            </div>
            <div class="preview-stage">
              <app-campaign-preview
                [layout]="layout()"
                [title]="previewTitle()"
                [body]="previewBody()"
                [ctaLabel]="previewCta()"
                [ctaUrl]="ctaUrl()"
                [image]="primaryImage()"
                [mediaType]="mediaType()"
                [iconUrl]="iconUrl()"
                [titleAlign]="titleAlign()"
                [bodyAlign]="bodyAlign()"
                [iconAlign]="iconAlign()"
                [sections]="sections()"
                [sectionOrder]="sectionOrder()"
              />
            </div>

            <!-- Layout: order + spacing of the sections. Pick one, reorder + tune. -->
            <div class="card spacing-controls">
              <div class="toolbar">
                <span class="section-title">Sections</span>
                <div class="toolbar__spacer"></div>
                <button class="btn btn--ghost btn--sm" type="button" (click)="resetSpacing()">
                  Reset all
                </button>
              </div>
              <span class="field__hint">
                Pick a section to reorder it and tune its spacing. The list is the top-to-bottom
                order in the dialog.
              </span>
              <div
                class="tabs tabs--wrap"
                role="radiogroup"
                aria-label="Section to reorder and adjust"
              >
                @for (key of sectionOrder(); track key) {
                  <button
                    type="button"
                    class="tab"
                    role="radio"
                    [attr.aria-checked]="selectedSection() === key"
                    [class.is-active]="selectedSection() === key"
                    (click)="selectedSection.set(key)"
                  >
                    {{ sectionLabel(key) }}
                  </button>
                }
              </div>
              <div class="reorder-row">
                <button
                  class="btn btn--sm btn--ghost"
                  type="button"
                  [disabled]="isFirstSection()"
                  (click)="moveSection(-1)"
                  aria-label="Move section up"
                >
                  ↑ Move up
                </button>
                <button
                  class="btn btn--sm btn--ghost"
                  type="button"
                  [disabled]="isLastSection()"
                  (click)="moveSection(1)"
                  aria-label="Move section down"
                >
                  ↓ Move down
                </button>
              </div>
              <app-section-spacing
                [label]="selectedLabel()"
                [value]="sections()[selectedSection()]"
                (valueChange)="setSection(selectedSection(), $event)"
              />
              <span class="field__hint">
                Padding is the space inside the section (set the media padding to 0 to fill
                edge-to-edge); “Gap below” is the space to the next section.
              </span>
            </div>
          </aside>
        </div>
      }
    </section>
  `,
})
export class CampaignFormComponent implements OnInit {
  private readonly _service = inject(CampaignsService);
  private readonly _usersService = inject(UsersService);
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _notify = inject(NotificationService);
  private readonly _destroyRef = inject(DestroyRef);

  protected readonly kinds = CAMPAIGN_KINDS;
  protected readonly statuses = CAMPAIGN_STATUSES;
  protected readonly audiences = CAMPAIGN_AUDIENCES;
  protected readonly renotifyPolicies = CAMPAIGN_RENOTIFY_POLICIES;
  protected readonly platformOptions = CAMPAIGN_PLATFORMS;
  protected readonly layouts = CAMPAIGN_LAYOUTS;
  protected readonly aligns = CAMPAIGN_ALIGNS;
  protected readonly mediaTypes = CAMPAIGN_MEDIA_TYPES;
  protected readonly sectionRows: readonly SectionRow[] = [
    { key: 'icon', label: 'Top icon' },
    { key: 'media', label: 'Main media' },
    { key: 'title', label: 'Title' },
    { key: 'body', label: 'Body' },
    { key: 'actions', label: 'Actions' },
  ];

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
  protected readonly primaryImage = signal<string>('');
  protected readonly ctaUrl = signal<string>('');
  protected readonly audience = signal<CampaignAudience>('all');
  protected readonly audienceUsers = signal<UserSummary[]>([]);
  protected readonly platforms = signal<CampaignPlatform[]>([]);
  protected readonly startsAt = signal<string>('');
  protected readonly endsAt = signal<string>('');
  protected readonly renotifyPolicy = signal<CampaignRenotifyPolicy>('never');
  protected readonly priority = signal<number>(0);

  // Presentation
  protected readonly layout = signal<CampaignLayout>('standard');
  protected readonly iconUrl = signal<string>('');
  protected readonly mediaType = signal<CampaignMediaType>('image');
  protected readonly titleAlign = signal<CampaignAlign>('center');
  protected readonly bodyAlign = signal<CampaignAlign>('center');
  protected readonly iconAlign = signal<CampaignAlign>('center');
  protected readonly sections = signal<CampaignSections>(cloneDefaultSections());
  protected readonly sectionOrder = signal<CampaignSectionKey[]>([...DEFAULT_SECTION_ORDER]);

  // Which section the reorder/spacing controls currently target.
  protected readonly selectedSection = signal<CampaignSectionKey>('media');
  protected readonly selectedLabel = computed<string>(() =>
    this.sectionLabel(this.selectedSection()),
  );
  protected readonly isFirstSection = computed<boolean>(
    () => this.sectionOrder().indexOf(this.selectedSection()) === 0,
  );
  protected readonly isLastSection = computed<boolean>(
    () => this.sectionOrder().indexOf(this.selectedSection()) === this.sectionOrder().length - 1,
  );

  // Preview
  protected readonly previewLang = signal<'vi' | 'en'>('vi');
  private readonly _viUsable = computed(() => !!this.viTitle().trim() && !!this.viBody().trim());
  private readonly _enUsable = computed(() => !!this.enTitle().trim() && !!this.enBody().trim());
  // Which language a recipient actually sees: their choice if usable, else the
  // other language (mirrors the server's resolveActiveLocale fallback).
  private readonly _previewLocale = computed<'vi' | 'en'>(() => {
    const pref = this.previewLang();
    const prefUsable = pref === 'en' ? this._enUsable() : this._viUsable();
    if (prefUsable) {
      return pref;
    }
    const otherUsable = pref === 'en' ? this._viUsable() : this._enUsable();
    return otherUsable ? (pref === 'en' ? 'vi' : 'en') : pref;
  });
  protected readonly previewTitle = computed(() =>
    this._previewLocale() === 'en' ? this.enTitle() : this.viTitle(),
  );
  protected readonly previewBody = computed(() =>
    this._previewLocale() === 'en' ? this.enBody() : this.viBody(),
  );
  protected readonly previewCta = computed(() =>
    this._previewLocale() === 'en' ? this.enCta() : this.viCta(),
  );
  protected readonly layoutHint = computed<string>(() => {
    switch (this.layout()) {
      case 'hero':
        return 'Full-bleed image banner at the top, then content.';
      case 'icon':
        return 'A prominent top icon leads the dialog (no main image).';
      case 'plain':
        return 'Text only — no image or icon.';
      default:
        return 'Optional inline image, then icon/title/body.';
    }
  });

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

  protected setSection(key: CampaignSectionKey, spacing: SectionSpacing): void {
    this.sections.update((current) => ({ ...current, [key]: spacing }));
  }

  protected sectionLabel(key: CampaignSectionKey): string {
    return this.sectionRows.find((row) => row.key === key)?.label ?? 'Section';
  }

  /** Move the selected section up (-1) or down (+1) in the render order. */
  protected moveSection(delta: -1 | 1): void {
    const key = this.selectedSection();
    this.sectionOrder.update((order) => {
      const from = order.indexOf(key);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= order.length) {
        return order;
      }
      const next = [...order];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  }

  protected resetSpacing(): void {
    this.sections.set(cloneDefaultSections());
    this.sectionOrder.set([...DEFAULT_SECTION_ORDER]);
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
        this.viTitle.set(campaign.content.vi?.title ?? '');
        this.viBody.set(campaign.content.vi?.body ?? '');
        this.viCta.set(campaign.content.vi?.ctaLabel ?? '');
        this.enTitle.set(campaign.content.en?.title ?? '');
        this.enBody.set(campaign.content.en?.body ?? '');
        this.enCta.set(campaign.content.en?.ctaLabel ?? '');
        this.primaryImage.set(campaign.mediaUrls[0] ?? '');
        this.ctaUrl.set(campaign.ctaUrl ?? '');
        this.audience.set(campaign.audience);
        this.audienceUsers.set([]);
        if (campaign.audience === 'specific_users' && campaign.targetUserIds.length > 0) {
          this._hydrateAudienceUsers(campaign.targetUserIds);
        }
        this.platforms.set([...campaign.platforms]);
        this.startsAt.set(isoToLocalInput(campaign.startsAt));
        this.endsAt.set(isoToLocalInput(campaign.endsAt));
        this.renotifyPolicy.set(campaign.renotifyPolicy);
        this.priority.set(campaign.priority);
        const p = campaign.presentation;
        this.layout.set(p.layout);
        this.iconUrl.set(p.iconUrl ?? '');
        this.mediaType.set(p.mediaType);
        this.titleAlign.set(p.titleAlign);
        this.bodyAlign.set(p.bodyAlign);
        this.iconAlign.set(p.iconAlign);
        this.sections.set({
          icon: { ...p.sections.icon },
          media: { ...p.sections.media },
          title: { ...p.sections.title },
          body: { ...p.sections.body },
          actions: { ...p.sections.actions },
        });
        this.sectionOrder.set([...p.sectionOrder]);
      });
  }

  /**
   * Resolve saved `targetUserIds` back into displayable summaries so the
   * audience picker shows names, not raw ids. An id that no longer resolves
   * (e.g. a deleted account) still renders as a chip — keyed by its own id —
   * so it isn't silently dropped from the audience on the next save.
   */
  private _hydrateAudienceUsers(ids: string[]): void {
    const limit = Math.min(Math.max(ids.length, 1), 200);
    this._usersService
      .searchSummaries({ ids }, { limit })
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe((res) => {
        const found = res?.items ?? [];
        const foundIds = new Set(found.map((u) => u.id));
        const missing = ids.filter((id) => !foundIds.has(id));
        this.audienceUsers.set([
          ...found,
          ...missing.map((id) => ({
            id,
            displayName: id,
            firstName: '',
            lastName: '',
            email: null,
            username: null,
            isActive: true,
          })),
        ]);
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
    const viComplete = !!this.viTitle().trim() && !!this.viBody().trim();
    const enComplete = !!this.enTitle().trim() && !!this.enBody().trim();
    if (!viComplete && !enComplete) {
      return 'Provide at least one language (Vietnamese or English) with a title and body.';
    }
    const image = this.primaryImage().trim();
    if (image && !IMAGE_URL_PATTERN.test(image)) {
      return 'The main media must be an absolute http(s) URL (or upload a file).';
    }
    const icon = this.iconUrl().trim();
    if (icon && !IMAGE_URL_PATTERN.test(icon)) {
      return 'The top icon must be an absolute http(s) URL (or upload a file).';
    }
    if (this.audience() === 'specific_users' && this.audienceUsers().length === 0) {
      return 'Add at least one target user, or choose “All”.';
    }
    const priority = Number(this.priority());
    if (!Number.isFinite(priority) || priority < 0 || priority > 1000) {
      return 'Priority must be between 0 and 1000.';
    }
    return null;
  }

  private _buildPayload(): CreateCampaign {
    const image = this.primaryImage().trim();

    // Only send a language that has some content — an empty language block is
    // omitted so delivery falls back to the other language.
    const content: CreateCampaign['content'] = {};
    const vi = {
      title: this.viTitle().trim(),
      body: this.viBody().trim(),
      ctaLabel: this.viCta().trim() || null,
    };
    const en = {
      title: this.enTitle().trim(),
      body: this.enBody().trim(),
      ctaLabel: this.enCta().trim() || null,
    };
    if (vi.title || vi.body) {
      content.vi = vi;
    }
    if (en.title || en.body) {
      content.en = en;
    }

    return {
      kind: this.kind(),
      status: this.status(),
      content,
      mediaUrls: image ? [image] : [],
      ctaUrl: this.ctaUrl().trim() || null,
      audience: this.audience(),
      targetUserIds:
        this.audience() === 'specific_users' ? this.audienceUsers().map((u) => u.id) : [],
      platforms: this.platforms(),
      startsAt: localInputToIso(this.startsAt()),
      endsAt: localInputToIso(this.endsAt()),
      renotifyPolicy: this.renotifyPolicy(),
      priority: Number(this.priority()),
      presentation: {
        layout: this.layout(),
        iconUrl: this.iconUrl().trim() || null,
        mediaType: this.mediaType(),
        titleAlign: this.titleAlign(),
        bodyAlign: this.bodyAlign(),
        iconAlign: this.iconAlign(),
        sections: this.sections(),
        sectionOrder: this.sectionOrder(),
      },
    };
  }
}
