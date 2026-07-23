/** Standard response envelope from the Zira gateway. */
export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta?: Record<string, unknown>;
}

/** Bearer token pair returned by the admin-login-code exchange + /auth/refresh. */
export interface TokenPair {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
  tokenType: string;
}

/** Cursor-paginated list (users search/history, feedback search, purchase requests). */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Non-cursor list wrapper (plans, promo codes, campaigns). */
export interface ItemsList<T> {
  items: T[];
}

export type Role = 'admin' | 'user' | 'staff';
export const ROLES: readonly Role[] = ['admin', 'user', 'staff'];

export type FeatureFlag =
  | 'ai_assistant'
  | 'zalo_bot_notifications'
  | 'telegram_bot_notifications'
  | 'approvals'
  | 'team_summary'
  | 'voice_capture'
  | 'quick_create'
  | 'smart_notifications'
  | 'drawings'
  | 'web_qr_login'
  | 'project_chatbot';

export const FEATURE_FLAGS: readonly FeatureFlag[] = [
  'ai_assistant',
  'zalo_bot_notifications',
  'telegram_bot_notifications',
  'approvals',
  'team_summary',
  'voice_capture',
  'quick_create',
  'smart_notifications',
  'drawings',
  'web_qr_login',
  'project_chatbot',
];

export type SupportedLanguage = 'default' | 'en' | 'vi' | 'ru';
export type SocialProvider = 'zalo' | 'telegram';
export type UserTheme = 'system' | 'light' | 'dark';
export type TimeFormat = '24h' | '12h';

/** Lightweight user shape used across users/feedback/subscriptions surfaces. */
export interface UserSummary {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  username: string | null;
  preferences?: Record<string, unknown>;
  isActive: boolean;
}
