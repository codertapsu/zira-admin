import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import {
  DEFAULT_CAMPAIGN_SECTIONS,
  DEFAULT_SECTION_ORDER,
  type CampaignAlign,
  type CampaignLayout,
  type CampaignMediaType,
  type CampaignSectionKey,
  type CampaignSections,
  type SectionSpacing,
} from './campaigns.models';

/**
 * Faithful preview of the end-user campaign dialog. Mirrors zira-client's
 * `campaign-dialog` rendering (layout + alignments + per-section spacing + HTML
 * body + top icon + image/video media) so an author sees what they'll publish.
 * Body is bound via [innerHTML] — Angular sanitizes it, same as the client.
 */
@Component({
  selector: 'app-campaign-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cp-dialog cp-dialog--{{ layout() }}">
      @if (layout() === 'hero' && image()) {
        @if (isVideo()) {
          <video class="cp-dialog__hero" [src]="image()" controls playsinline></video>
        } @else {
          <img class="cp-dialog__hero" [src]="image()" alt="" />
        }
      }
      <div class="cp-dialog__inner">
        @for (section of sectionOrder(); track section) {
          @switch (section) {
            @case ('icon') {
              @if (iconUrl()) {
                <div
                  class="cp-dialog__icon"
                  [style.padding]="pad(sections().icon)"
                  [style.margin-bottom.px]="sections().icon.marginBottom"
                  [style.justify-content]="flex(iconAlign())"
                >
                  <img class="cp-dialog__icon-img" [src]="iconUrl()" alt="" />
                </div>
              }
            }
            @case ('media') {
              @if (layout() === 'standard' && image()) {
                <div
                  class="cp-dialog__media"
                  [style.padding]="pad(sections().media)"
                  [style.margin-bottom.px]="sections().media.marginBottom"
                >
                  @if (isVideo()) {
                    <video class="cp-dialog__media-el" [src]="image()" controls playsinline></video>
                  } @else {
                    <img class="cp-dialog__media-el" [src]="image()" alt="" />
                  }
                </div>
              }
            }
            @case ('title') {
              <h2
                class="cp-dialog__title"
                [style.padding]="pad(sections().title)"
                [style.margin-bottom.px]="sections().title.marginBottom"
                [style.text-align]="titleAlign()"
              >
                {{ title() || 'Your title' }}
              </h2>
            }
            @case ('body') {
              <div
                class="cp-dialog__body"
                [style.padding]="pad(sections().body)"
                [style.margin-bottom.px]="sections().body.marginBottom"
                [style.text-align]="bodyAlign()"
                [innerHTML]="body()"
              ></div>
            }
            @case ('actions') {
              <div
                class="cp-dialog__actions"
                [style.padding]="pad(sections().actions)"
                [style.margin-bottom.px]="sections().actions.marginBottom"
              >
                <button class="cp-dialog__btn cp-dialog__btn--ghost" type="button" disabled>
                  Close
                </button>
                @if (ctaUrl() && ctaLabel()) {
                  <button class="cp-dialog__btn cp-dialog__btn--primary" type="button" disabled>
                    {{ ctaLabel() }}
                  </button>
                }
              </div>
            }
          }
        }
      </div>
    </div>
  `,
})
export class CampaignPreviewComponent {
  public readonly layout = input<CampaignLayout>('standard');
  public readonly title = input<string>('');
  public readonly body = input<string>('');
  public readonly ctaLabel = input<string>('');
  public readonly ctaUrl = input<string>('');
  public readonly image = input<string>('');
  public readonly mediaType = input<CampaignMediaType>('image');
  public readonly iconUrl = input<string>('');
  public readonly titleAlign = input<CampaignAlign>('center');
  public readonly bodyAlign = input<CampaignAlign>('center');
  public readonly iconAlign = input<CampaignAlign>('center');
  public readonly sections = input<CampaignSections>(DEFAULT_CAMPAIGN_SECTIONS);
  public readonly sectionOrder = input<CampaignSectionKey[]>(DEFAULT_SECTION_ORDER);

  protected readonly isVideo = computed(() => this.mediaType() === 'video');

  protected flex(align: CampaignAlign): string {
    if (align === 'left') {
      return 'flex-start';
    }
    if (align === 'right') {
      return 'flex-end';
    }
    return 'center';
  }

  protected pad(spacing: SectionSpacing): string {
    return `${spacing.paddingTop}px ${spacing.paddingRight}px ${spacing.paddingBottom}px ${spacing.paddingLeft}px`;
  }
}
