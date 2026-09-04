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

/**
 * `null` until the gateway answers. Deliberately not a default ceiling: a
 * pre-check that guesses low rejects files the server would have accepted, so
 * an unknown limit means "do not block" rather than "assume 20 MB".
 */
const UNKNOWN_LIMIT = null;

/**
 * Reads the limits the gateway publishes at `GET /client-config`.
 *
 * The DTO's own words: a client that respects this "never has an upload
 * rejected for size". This console did not read it at all, so an oversized
 * campaign video uploaded in full, came back 413, and reported "Upload failed.
 * Check the file and try again" with no limit stated anywhere to check against.
 *
 * Public endpoint, fetched once and cached. On failure the limit stays unknown
 * and the pre-check is skipped, so a config blip cannot block an upload the
 * server would have taken — the server remains the authority either way.
 */
@Injectable({ providedIn: 'root' })
export class ClientConfigService {
  private readonly _api = inject(ApiService);
  private _requested = false;

  public readonly maxFileSizeBytes = signal<number | null>(UNKNOWN_LIMIT);

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
      // Leave the limit unknown so the pre-check skips. Retry on the next
      // request rather than pinning a guess for the whole session.
      error: () => {
        this._requested = false;
      },
    });
  }
}
