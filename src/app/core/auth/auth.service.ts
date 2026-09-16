import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import type { User } from 'firebase/auth';
import { loadAuthIfBrowser } from '../config/firebase.config';

/**
 * Login failures, in Egyptian Arabic.
 *
 * Every credential problem maps to one message on purpose: telling the
 * visitor which half was wrong would confirm whether an account exists
 * (build spec §12). `auth/user-disabled` is folded in for the same reason.
 */
function messageFor(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/user-disabled':
      return 'الإيميل أو الباسورد غلط';
    case 'auth/too-many-requests':
      return 'جربت كتير أوي، استنى شوية وحاول تاني';
    case 'auth/network-request-failed':
      return 'النت مش شغال، اتأكد من الاتصال وحاول تاني';
    default:
      return 'حصلت مشكلة، حاول تاني';
  }
}

function errorCodeOf(error: unknown): string {
  return error !== null && typeof error === 'object' && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
}

/**
 * The single admin account, email/password only. The user is created by hand
 * in the Firebase console — there is no sign-up route.
 *
 * The Auth SDK is loaded with `import()`, so it stays out of the initial
 * chunk; on the server it is never loaded at all and `whenReady()` resolves
 * to null immediately.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly destroyRef = inject(DestroyRef);

  /** Resolved once, in an injection context, so the platform check is valid. */
  private readonly api = loadAuthIfBrowser();

  private readonly currentUser = signal<User | null>(null);
  private readonly resolved = signal(false);
  private readonly firstState: Promise<User | null>;

  readonly user = this.currentUser.asReadonly();

  /** False until Firebase has reported the restored session. */
  readonly ready = this.resolved.asReadonly();

  readonly isSignedIn = computed(() => this.currentUser() !== null);
  readonly uid = computed(() => this.currentUser()?.uid ?? null);

  constructor() {
    this.firstState = this.api.then(
      (api) =>
        new Promise<User | null>((resolve) => {
          if (!api) {
            this.resolved.set(true);
            resolve(null);
            return;
          }

          let settled = false;

          const unsubscribe = api.fa.onAuthStateChanged(api.auth, (user) => {
            this.currentUser.set(user);
            this.resolved.set(true);

            if (!settled) {
              settled = true;
              resolve(user);
            }
          });

          this.destroyRef.onDestroy(unsubscribe);
        }),
    );
  }

  /**
   * Resolves once the persisted session has been restored. Guards must await
   * this, or a page refresh would bounce a signed-in owner to the login page.
   */
  whenReady(): Promise<User | null> {
    return this.firstState;
  }

  /** Throws an `Error` whose message is already Egyptian Arabic and safe to show. */
  async signIn(email: string, password: string): Promise<User> {
    const api = await this.api;

    if (!api) {
      throw new Error('حصلت مشكلة، حاول تاني');
    }

    try {
      const credential = await api.fa.signInWithEmailAndPassword(api.auth, email.trim(), password);

      // Publish immediately rather than waiting for onAuthStateChanged: the
      // caller navigates straight into a guarded route on the next line.
      this.currentUser.set(credential.user);
      this.resolved.set(true);

      return credential.user;
    } catch (error) {
      throw new Error(messageFor(errorCodeOf(error)));
    }
  }

  async signOut(): Promise<void> {
    const api = await this.api;
    if (api) {
      await api.fa.signOut(api.auth);
    }
  }
}
