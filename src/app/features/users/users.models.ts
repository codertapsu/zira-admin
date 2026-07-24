import type {
  FeatureFlag,
  Role,
  SocialProvider,
  SupportedLanguage,
  TimeFormat,
  UserSummary,
  UserTheme,
} from '../../core/api/models';

export type UserSortBy = 'createdAt' | 'updatedAt' | 'displayName' | 'lastLoginAt';
export type SortDir = 'asc' | 'desc';

export interface AdminUserFilter {
  q?: string;
  roles?: Role[];
  isActive?: boolean;
  ids?: string[];
  lastLoginBefore?: string;
  lastLoginAfter?: string;
}

export interface AdminUserSearchOptions {
  sortBy?: UserSortBy;
  sortDir?: SortDir;
  cursor?: string;
  limit?: number;
}

export interface AdminUserSearch {
  filter: AdminUserFilter;
  options?: AdminUserSearchOptions;
}

export interface AdminUpdateUserProperties {
  timezone?: string;
  timezoneId?: string;
  timeFormat?: TimeFormat;
  theme?: UserTheme;
  language?: SupportedLanguage;
  preferences?: Record<string, unknown>;
  quietHoursEnabled?: boolean;
  quietHoursStart?: number;
  quietHoursEnd?: number;
}

export interface UserSubscription {
  planCode: string | null;
  planFeatureKeys: FeatureFlag[];
  effectiveFeatureKeys: FeatureFlag[];
}

export interface UserResponse {
  id: string;
  socialId: string | null;
  socialProvider: SocialProvider | null;
  username: string | null;
  email: string | null;
  displayName: string;
  firstName: string;
  lastName: string;
  roles: Role[];
  language: SupportedLanguage;
  timezone: string;
  timezoneId: string | null;
  timeFormat: TimeFormat;
  theme: UserTheme;
  enabledFeatureFlags: FeatureFlag[];
  preferences: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  lastLoginAt: string | null;
  deactivatedAt: string | null;
  deactivatedById: string | null;
  quietHoursEnabled: boolean;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  subscription?: UserSubscription | null;
}

export type UserChangeAction =
  | 'role_assigned'
  | 'role_revoked'
  | 'properties_updated'
  | 'deactivated'
  | 'reactivated'
  | 'deleted';

export interface UserChangeLog {
  id: string;
  targetUserId: string;
  actorId: string | null;
  actor: UserSummary | null;
  action: UserChangeAction;
  /** Scalar updates: `{ field: { from, to } }`. Role changes: `{ role }`. Lifecycle actions: `{}`. */
  changes: Record<string, unknown>;
  createdAt: string;
}

/** Safe projection of a refresh-token row (`GET/DELETE /admin/users/:id/sessions*`). */
export interface AdminSession {
  id: string;
  deviceId: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  familyId: string;
  isReused: boolean;
}

/** Shared shape of the Telegram + Zalo bot connection responses. */
export interface BotConnection {
  id: string | null;
  /** Partially masked chat identifier (first 4 chars visible) — display only. */
  chatIdMasked: string | null;
  displayName: string | null;
  connectedAt: string | null;
  lastSeenAt: string | null;
  connected: boolean;
}

/** `POST /admin/users/:id/data-export` result — a one-time presigned download link. */
export interface UserDataExport {
  url: string;
  filename: string;
  contentType: string;
  expiresAt: string;
}
