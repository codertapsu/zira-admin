import { inject, Injectable } from '@angular/core';

import { type Observable } from 'rxjs';

import { ApiService } from '../../core/api/api.service';
import type { CursorPage } from '../../core/api/models';
import type {
  AdminBotBindingFilter,
  AdminBotBindingResponse,
  BotBindingPlatform,
} from './bots.models';

/**
 * Client for the admin bot-binding inventory (`/admin/bot-bindings`). Unified
 * across the Zalo and Telegram platforms; read + force-unlink only — the
 * force-unlink is a DB-only soft-remove and never touches the Bot API.
 */
@Injectable({ providedIn: 'root' })
export class BotsService {
  private readonly _api = inject(ApiService);

  public list(
    filter: AdminBotBindingFilter,
    options?: { cursor?: string; limit?: number },
  ): Observable<CursorPage<AdminBotBindingResponse>> {
    return this._api.get<CursorPage<AdminBotBindingResponse>>('/admin/bot-bindings', {
      platform: filter.platform,
      projectId: filter.projectId,
      status: filter.status,
      cursor: options?.cursor,
      limit: options?.limit,
    });
  }

  /** DB-only soft-remove; the `{ success: true }` body is ignored by `delete()`. */
  public forceUnlink(platform: BotBindingPlatform, id: string): Observable<void> {
    return this._api.delete(`/admin/bot-bindings/${platform}/${id}`);
  }
}
