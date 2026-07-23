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
  changes: Record<string, unknown>;
  createdAt: string;
}
