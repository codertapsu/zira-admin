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

export interface CampaignLocaleContent {
  title: string;
  body: string;
  ctaLabel?: string | null;
}

export interface CampaignContent {
  vi: CampaignLocaleContent;
  en: CampaignLocaleContent;
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
}

export type UpdateCampaign = Partial<CreateCampaign>;
