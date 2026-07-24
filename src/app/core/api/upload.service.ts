import { inject, Injectable } from '@angular/core';

import { map, type Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiService } from './api.service';

interface FileUploadResult {
  id: string;
  inlineUrl: string;
}

/**
 * Uploads a file (image OR video) via the gateway (`POST /files/upload`,
 * multipart) and returns an ABSOLUTE inline URL. Absolute is required because
 * campaign media render inside the Zalo/Telegram webviews, which are a different
 * origin than the gateway — a relative `/api/v1/files/…` would resolve against
 * the wrong host.
 */
@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly _api = inject(ApiService);
  private readonly _origin = environment.apiBaseUrl.replace(/\/api\/v\d+\/?$/, '');

  public uploadFile(file: File): Observable<string> {
    return this._api
      .upload<FileUploadResult>('/files/upload', file)
      .pipe(map((res) => `${this._origin}${res.inlineUrl}`));
  }
}
