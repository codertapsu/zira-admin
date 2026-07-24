export type CampaignKind = 'whats_new' | 'announcement' | 'alert' | 'ad';
export const CAMPAIGN_KINDS: readonly CampaignKind[] = ['whats_new', 'announcement', 'alert', 'ad'];

export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'archived';
export const CAMPAIGN_STATUSES: readonly CampaignStatus[] = [
  'draft',
  'scheduled',
  'active',
  'archived',
];

export type CampaignAudience = 'all' | 'specific_users';
export const CAMPAIGN_AUDIENCES: readonly CampaignAudience[] = ['all', 'specific_users'];

export type CampaignPlatform = 'web' | 'zalo' | 'telegram';
export const CAMPAIGN_PLATFORMS: readonly CampaignPlatform[] = ['web', 'zalo', 'telegram'];

export type CampaignRenotifyPolicy = 'never' | 'daily' | 'on_relaunch';
export const CAMPAIGN_RENOTIFY_POLICIES: readonly CampaignRenotifyPolicy[] = [
  'never',
  'daily',
  'on_relaunch',
];

export type CampaignLayout = 'standard' | 'hero' | 'icon' | 'plain';
export const CAMPAIGN_LAYOUTS: readonly CampaignLayout[] = ['standard', 'hero', 'icon', 'plain'];

export type CampaignAlign = 'left' | 'center' | 'right';
export const CAMPAIGN_ALIGNS: readonly CampaignAlign[] = ['left', 'center', 'right'];

export type CampaignMediaType = 'image' | 'video';
export const CAMPAIGN_MEDIA_TYPES: readonly CampaignMediaType[] = ['image', 'video'];

export type CampaignSectionKey = 'icon' | 'media' | 'title' | 'body' | 'actions';
export const CAMPAIGN_SECTION_KEYS: readonly CampaignSectionKey[] = [
  'icon',
  'media',
  'title',
  'body',
  'actions',
];

export interface SectionSpacing {
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  marginBottom: number;
}

export type CampaignSections = Record<CampaignSectionKey, SectionSpacing>;

/** Canonical top-to-bottom section order. */
export const DEFAULT_SECTION_ORDER: CampaignSectionKey[] = [
  'icon',
  'media',
  'title',
  'body',
  'actions',
];

export interface CampaignPresentation {
  layout: CampaignLayout;
  iconUrl: string | null;
  mediaType: CampaignMediaType;
  titleAlign: CampaignAlign;
  bodyAlign: CampaignAlign;
  iconAlign: CampaignAlign;
  sections: CampaignSections;
  sectionOrder: CampaignSectionKey[];
}

// Each section owns the space above itself (paddingTop) — so whichever section
// renders first supplies the card's top gutter — and the last section owns the
// bottom gutter (actions.paddingBottom). No spacing lives on any container.
// `marginBottom` stays available as an extra gap-below control (0 by default).
export const DEFAULT_CAMPAIGN_SECTIONS: CampaignSections = {
  icon: { paddingTop: 24, paddingRight: 24, paddingBottom: 0, paddingLeft: 24, marginBottom: 0 },
  media: { paddingTop: 16, paddingRight: 24, paddingBottom: 0, paddingLeft: 24, marginBottom: 0 },
  title: { paddingTop: 16, paddingRight: 24, paddingBottom: 0, paddingLeft: 24, marginBottom: 0 },
  body: { paddingTop: 8, paddingRight: 24, paddingBottom: 0, paddingLeft: 24, marginBottom: 0 },
  actions: {
    paddingTop: 20,
    paddingRight: 24,
    paddingBottom: 24,
    paddingLeft: 24,
    marginBottom: 0,
  },
};

export const DEFAULT_CAMPAIGN_PRESENTATION: CampaignPresentation = {
  layout: 'standard',
  iconUrl: null,
  mediaType: 'image',
  titleAlign: 'center',
  bodyAlign: 'center',
  iconAlign: 'center',
  sections: DEFAULT_CAMPAIGN_SECTIONS,
  sectionOrder: [...DEFAULT_SECTION_ORDER],
};

/** Deep-clone the default sections so form edits never mutate the shared const. */
export function cloneDefaultSections(): CampaignSections {
  return {
    icon: { ...DEFAULT_CAMPAIGN_SECTIONS.icon },
    media: { ...DEFAULT_CAMPAIGN_SECTIONS.media },
    title: { ...DEFAULT_CAMPAIGN_SECTIONS.title },
    body: { ...DEFAULT_CAMPAIGN_SECTIONS.body },
    actions: { ...DEFAULT_CAMPAIGN_SECTIONS.actions },
  };
}

export interface CampaignLocaleContent {
  title: string;
  body: string;
  ctaLabel?: string | null;
}

/**
 * Localized copy. Both languages are optional — an author may define only one.
 * At least one must be complete; delivery falls back across languages.
 */
export interface CampaignContent {
  vi?: CampaignLocaleContent;
  en?: CampaignLocaleContent;
}

export interface CampaignResponse {
  id: string;
  kind: CampaignKind;
  status: CampaignStatus;
  content: CampaignContent;
  mediaUrls: string[];
  ctaUrl: string | null;
  audience: CampaignAudience;
  targetUserIds: string[];
  platforms: CampaignPlatform[];
  startsAt: string | null;
  endsAt: string | null;
  renotifyPolicy: CampaignRenotifyPolicy;
  priority: number;
  presentation: CampaignPresentation;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignListResponse {
  items: CampaignResponse[];
}

export interface CampaignStats {
  totalViews: number;
  seenUsers: number;
  dismissedUsers: number;
}

export interface CreateCampaign {
  kind: CampaignKind;
  content: CampaignContent;
  mediaUrls?: string[];
  ctaUrl?: string | null;
  audience: CampaignAudience;
  targetUserIds?: string[];
  platforms?: CampaignPlatform[];
  startsAt?: string | null;
  endsAt?: string | null;
  renotifyPolicy?: CampaignRenotifyPolicy;
  priority?: number;
  status?: CampaignStatus;
  presentation?: Partial<CampaignPresentation>;
}

export type UpdateCampaign = Partial<CreateCampaign>;
