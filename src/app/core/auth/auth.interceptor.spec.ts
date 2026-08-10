import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiEnvelope, TokenPair } from '../api/models';
import { authInterceptor } from './auth.interceptor';
import { TokenStoreService } from './token-store.service';

function tokenPair(accessToken: string, refreshToken: string): ApiEnvelope<TokenPair> {
  return {
    success: true,
    data: {
      accessToken,
      accessTokenExpiresIn: 900,
      refreshToken,
      refreshTokenExpiresIn: 604800,
      tokenType: 'Bearer',
    },
  };
}

// Request URLs are matched by SUFFIX, never in full: the test build runs the
// `development` configuration, so `environment.apiBaseUrl` is the localhost
// gateway and a full-string match would couple these specs to an env file.
const usersCall = (url: string): boolean => url.endsWith('/admin/users');
const refreshCall = (url: string): boolean => url.endsWith('/auth/refresh');

describe('authInterceptor', () => {
  beforeEach(() => {
    // TokenStoreService hydrates from localStorage at construction, and
    // localStorage outlives TestBed's per-spec injector reset.
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
  });

  it('attaches the bearer token, and omits the header entirely when there is none', () => {
    const tokens = TestBed.inject(TokenStoreService);
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);

    tokens.setTokens('a1', 'r1');
    http.get('/admin/users').subscribe();
    const authed = httpMock.expectOne((r) => usersCall(r.url));
    expect(authed.request.headers.get('Authorization')).toBe('Bearer a1');
    authed.flush({});

    tokens.clear();
    http.get('/admin/users').subscribe();
    const anonymous = httpMock.expectOne((r) => usersCall(r.url));
    // `has`, not "is empty": the interceptor must pass the ORIGINAL request
    // through untouched rather than send `Authorization: Bearer null`, which
    // the gateway would reject differently from an anonymous call.
    expect(anonymous.request.headers.has('Authorization')).toBe(false);
    anonymous.flush({});

    httpMock.verify();
  });

  it('on a 401 it rotates and retries the original request with the NEW access token', () => {
    const tokens = TestBed.inject(TokenStoreService);
    const http = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);

    tokens.setTokens('a1', 'r1');
    let received: unknown = null;
    http.get('/admin/users').subscribe((res) => {
      received = res;
    });

    const first = httpMock.expectOne((r) => usersCall(r.url));
    expect(first.request.headers.get('Authorization')).toBe('Bearer a1');
    first.flush({}, { status: 401, statusText: 'Unauthorized' });

    const rotation = httpMock.expectOne((r) => refreshCall(r.url));
    expect(rotation.request.method).toBe('POST');
    // The gateway cookie is not available cross-origin, so this header IS the
    // rotation credential.
    expect(rotation.request.headers.get('x-refresh-token')).toBe('r1');
    rotation.flush(tokenPair('a2', 'r2'));

    const retried = httpMock.expectOne((r) => usersCall(r.url));
    // The assertion that matters: the retry must re-read the rotated token. A
    // refactor that replayed the already-cloned request would resend `a1` and
    // loop.
    expect(retried.request.headers.get('Authorization')).toBe('Bearer a2');
    retried.flush({ success: true, data: { ok: true } });

    // The rotation is transparent to the call site.
    expect(received).toEqual({ success: true, data: { ok: true } });
    httpMock.verify();
  });
});
