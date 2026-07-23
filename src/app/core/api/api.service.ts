import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { map, type Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { ApiEnvelope } from './models';

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

/**
 * Thin wrapper over HttpClient for the Zira gateway: prefixes `apiBaseUrl`,
 * unwraps the `ApiEnvelope`, and drops empty query params. The bearer/refresh
 * interceptor still runs underneath. Feature services build on this.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly _http = inject(HttpClient);
  private readonly _base = environment.apiBaseUrl;

  public get<T>(path: string, params?: QueryParams): Observable<T> {
    return this._http
      .get<ApiEnvelope<T>>(this._url(path), { params: this._params(params) })
      .pipe(map((envelope) => envelope.data));
  }

  public post<T>(path: string, body?: unknown): Observable<T> {
    return this._http
      .post<ApiEnvelope<T>>(this._url(path), body ?? {})
      .pipe(map((envelope) => envelope.data));
  }

  public patch<T>(path: string, body?: unknown): Observable<T> {
    return this._http
      .patch<ApiEnvelope<T>>(this._url(path), body ?? {})
      .pipe(map((envelope) => envelope.data));
  }

  /** DELETE endpoints return 204 (no body) — resolve to void. */
  public delete(path: string): Observable<void> {
    return this._http.delete(this._url(path)).pipe(map(() => undefined));
  }

  private _url(path: string): string {
    return `${this._base}${path}`;
  }

  private _params(params?: QueryParams): HttpParams {
    let httpParams = new HttpParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          httpParams = httpParams.set(key, String(value));
        }
      }
    }
    return httpParams;
  }
}
