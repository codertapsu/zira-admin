import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiEnvelope, TokenPair } from '../api/models';
import { AuthService } from './auth.service';
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

const refreshCall = (url: string): boolean => url.endsWith('/auth/refresh');

describe('AuthService.refresh', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
  });

  it('shares one rotation across concurrent callers, then starts a fresh one', () => {
    const auth = TestBed.inject(AuthService);
    const tokens = TestBed.inject(TokenStoreService);
    const httpMock = TestBed.inject(HttpTestingController);

    tokens.setTokens('a1', 'r1');

    let firstCompleted = false;
    let secondCompleted = false;
    auth.refresh().subscribe({
      complete: () => {
        firstCompleted = true;
      },
    });
    auth.refresh().subscribe({
      complete: () => {
        secondCompleted = true;
      },
    });

    // `expectOne` IS the assertion. Two POSTs here would mean the second one
    // carries a refresh token the first already rotated away, tripping server
    // reuse detection and revoking the whole family.
    const rotation = httpMock.expectOne((r) => refreshCall(r.url));
    expect(rotation.request.headers.get('x-refresh-token')).toBe('r1');
    rotation.flush(tokenPair('a2', 'r2'));

    // The replay is what lets the second caller see a value it did not trigger.
    expect(firstCompleted).toBe(true);
    expect(secondCompleted).toBe(true);
    expect(tokens.accessToken()).toBe('a2');

    // The other half: `finalize` must clear the in-flight handle. Without this
    // assertion, an implementation that caches the rotation forever and never
    // refreshes again would pass just as well.
    auth.refresh().subscribe();
    const second = httpMock.expectOne((r) => refreshCall(r.url));
    expect(second.request.headers.get('x-refresh-token')).toBe('r2');
    second.flush(tokenPair('a3', 'r3'));
    expect(tokens.accessToken()).toBe('a3');

    httpMock.verify();
  });
});
