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

/** Lightweight user shape from POST /admin/users/search-summaries. */
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

export interface AdminUserSummarySearchResponse {
  items: UserSummary[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AdminUserFilter {
  q?: string;
  isActive?: boolean;
}

export interface AdminUserSearchOptions {
  cursor?: string;
  limit?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'displayName' | 'lastLoginAt';
  sortDir?: 'asc' | 'desc';
}
