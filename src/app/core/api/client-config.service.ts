import { inject, Injectable, signal } from '@angular/core';

import { ApiService } from './api.service';

/** Mirrors `ClientConfigUploadsResponse` on the gateway. */
interface ClientConfigUploads {
  maxFileSizeBytes: number;
  acceptedMimeTypes: string[];
}

interface ClientConfigResponse {
  uploads: ClientConfigUploads;
}

/** Matches the gateway's own fallback, so the check is never wilder than the server. */
const DEFAULT_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * Reads the limits the gateway publishes at `GET /client-config`.
 *
 * The DTO's own words: a client that respects this "never has an upload
 * rejected for size". This console did not read it at all, so an oversized
 * campaign video uploaded in full, came back 413, and reported "Upload failed.
 * Check the file and try again" with no limit stated anywhere to check against.
 *
 * Public endpoint, fetched once and cached. On any failure the default stands,
 * so a config blip cannot block uploads that would have succeeded.
 */
@Injectable({ providedIn: 'root' })
export class ClientConfigService {
  private readonly _api = inject(ApiService);
  private _requested = false;

  public readonly maxFileSizeBytes = signal<number>(DEFAULT_MAX_FILE_SIZE_BYTES);

  public ensureLoaded(): void {
    if (this._requested) {
      return;
    }
    this._requested = true;

    this._api.get<ClientConfigResponse>('/client-config').subscribe({
      next: (config) => {
        const limit = config?.uploads?.maxFileSizeBytes;

        if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
          this.maxFileSizeBytes.set(limit);
        }
      },
      error: () => undefined,
    });
  }
}
