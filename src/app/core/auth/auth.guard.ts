import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';

import { TokenStoreService } from './token-store.service';

/**
 * Gate for the authenticated shell. Redirects to the connect screen when
 * there is no access token. The server is the real authorization boundary
 * (every admin endpoint is `@Roles(Admin, Staff)`); this guard is UX only.
 */
export const authGuard: CanActivateFn = () => {
  const tokens = inject(TokenStoreService);
  const router = inject(Router);

  if (tokens.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/connect']);
};
