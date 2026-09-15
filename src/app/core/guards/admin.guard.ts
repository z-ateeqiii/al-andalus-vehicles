import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/**
 * Keeps signed-out visitors out of `/admin/**`.
 *
 * This is a convenience, not the security boundary — anyone can skip a client
 * guard. Authorisation is enforced by `firestore.rules`, which require an
 * `admins/{uid}` document for every write. That document is deliberately
 * unreadable by any client, so the guard checks authentication only.
 *
 * It awaits `whenReady()` so refreshing an admin page does not bounce a
 * signed-in owner to the login screen while Firebase restores the session.
 */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = await auth.whenReady();

  return user !== null ? true : router.createUrlTree(['/admin/login']);
};
