import { inject, Injectable } from '@angular/core';

import { type Observable } from 'rxjs';

import { ApiService, type QueryParams } from '../../core/api/api.service';
import type { CursorPage } from '../../core/api/models';
import type {
  AdminLoginCodeAudit,
  AdminLoginCodeAuditOptions,
  SecurityCursorOptions,
  TokenReuseEvent,
} from './security.models';

/** Client for the admin security-audit endpoints (`/admin/security`). */
@Injectable({ providedIn: 'root' })
export class SecurityService {
  private readonly _api = inject(ApiService);

  /** Reverse-chronological feed of flagged refresh-token reuse (token-theft signal). */
  public tokenReuseEvents(
    options?: SecurityCursorOptions,
  ): Observable<CursorPage<TokenReuseEvent>> {
    return this._api.get<CursorPage<TokenReuseEvent>>(
      '/admin/security/token-reuse-events',
      options as QueryParams | undefined,
    );
  }

  /** Audit feed of admin-console login codes: who minted them, and whether redeemed. */
  public adminLoginCodes(
    options?: AdminLoginCodeAuditOptions,
  ): Observable<CursorPage<AdminLoginCodeAudit>> {
    return this._api.get<CursorPage<AdminLoginCodeAudit>>(
      '/admin/security/admin-login-codes',
      options as QueryParams | undefined,
    );
  }
}
