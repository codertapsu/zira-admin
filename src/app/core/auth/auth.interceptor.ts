import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from './auth.service';
import { TokenStoreService } from './token-store.service';

/**
 * Attaches the bearer access token to outgoing requests. On a 401, rotates
 * the token pair once via /auth/refresh and retries; if the refresh itself
 * fails, tears the session down and bounces to the connect screen. Auth
 * endpoints are exempt from the retry to avoid a refresh loop.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokens = inject(TokenStoreService);
  const auth = inject(AuthService);

  const access = tokens.accessToken();
  const authReq = access ? req.clone({ setHeaders: { Authorization: `Bearer ${access}` } }) : req;

  const isAuthCall = req.url.includes('/auth/');

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        tokens.refreshToken() !== null &&
        !isAuthCall
      ) {
        return auth.refresh().pipe(
          // Only a failed REFRESH tears down the session. This catchError is
          // before switchMap so it does not swallow errors from the retried
          // request (a transient 500 on retry must not force a logout).
          catchError((refreshError: unknown) => {
            auth.logout();

            return throwError(() => refreshError);
          }),
          switchMap(() => {
            const refreshed = tokens.accessToken();
            const retried = refreshed
              ? req.clone({ setHeaders: { Authorization: `Bearer ${refreshed}` } })
              : req;

            return next(retried);
          }),
        );
      }

      return throwError(() => error);
    }),
  );
};
