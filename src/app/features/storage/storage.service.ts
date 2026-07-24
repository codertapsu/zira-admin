import { inject, Injectable } from '@angular/core';

import { map, type Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/api/api.service';
import type { CursorPage } from '../../core/api/models';
import type {
  AdminFileFilter,
  AdminFileResponse,
  FileDownloadResponse,
  FilesOverviewResponse,
} from './storage.models';

/** Client for the admin file-storage endpoints (`/admin/files`, `/admin/users/:id/files`). */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly _api = inject(ApiService);
  /** Gateway origin (apiBaseUrl minus the `/api/vN` prefix) — mirrors UploadService. */
  private readonly _origin = environment.apiBaseUrl.replace(/\/api\/v\d+\/?$/, '');

  public overview(): Observable<FilesOverviewResponse> {
    return this._api.get<FilesOverviewResponse>('/admin/files/overview');
  }

  public listForUser(
    userId: string,
    filter: AdminFileFilter,
    cursor?: string,
    limit = 50,
  ): Observable<CursorPage<AdminFileResponse>> {
    return this._api.get<CursorPage<AdminFileResponse>>(`/admin/users/${userId}/files`, {
      status: filter.status,
      cursor,
      limit,
    });
  }

  /**
   * Resolves a one-time download link and rewrites it to an ABSOLUTE URL —
   * `window.open` is called from the Firebase-hosted admin origin, so a
   * gateway-relative `/api/v1/files/…` path would resolve against the wrong
   * host. Mirrors `UsersService.generateDataExport` / `UploadService`.
   */
  public downloadUrl(id: string): Observable<string> {
    return this._api
      .get<FileDownloadResponse>(`/admin/files/${id}/download`)
      .pipe(map((res) => `${this._origin}${res.url}`));
  }
}
