/**
 * Safe projection of a reused `RefreshToken` row (`is_reused = true`) — reuse
 * indicates a revoked token was replayed, a potential token-theft signal.
 * Mirrors `TokenReuseEventResponse` (zira-server auth/dtos). Never a hash.
 */
export interface TokenReuseEvent {
  id: string;
  userId: string;
  deviceId: string | null;
  ip: string | null;
  userAgent: string | null;
  familyId: string;
  revokedAt: string | null;
}

/**
 * Safe audit projection of an `admin_login_codes` row — who minted an
 * admin-console login code, from where, and whether it was redeemed. Mirrors
 * `AdminLoginCodeAuditResponse` (zira-server auth/dtos). Never a hash.
 */
export interface AdminLoginCodeAudit {
  id: string;
  userId: string;
  createdAt: string;
  createdIp: string | null;
  createdUserAgent: string | null;
  expiresAt: string;
  consumedAt: string | null;
  consumedIp: string | null;
  consumedUserAgent: string | null;
  redeemed: boolean;
}

export interface SecurityCursorOptions {
  cursor?: string;
  limit?: number;
}

export interface AdminLoginCodeAuditOptions extends SecurityCursorOptions {
  userId?: string;
}
