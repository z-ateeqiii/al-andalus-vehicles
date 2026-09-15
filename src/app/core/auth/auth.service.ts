import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { FIREBASE_AUTH } from '../config/firebase.config';

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
 * On the server `FIREBASE_AUTH` is null, so nobody is ever signed in during
 * SSR and `whenReady()` resolves immediately.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly destroyRef = inject(DestroyRef);

  private readonly currentUser = signal<User | null>(null);
  private readonly resolved = signal(false);
  private readonly firstState: Promise<User | null>;

  readonly user = this.currentUser.asReadonly();

  /** False until Firebase has reported the restored session. */
  readonly ready = this.resolved.asReadonly();

  readonly isSignedIn = computed(() => this.currentUser() !== null);
  readonly uid = computed(() => this.currentUser()?.uid ?? null);

  constructor() {
    const auth = this.auth;

    if (!auth) {
      this.resolved.set(true);
      this.firstState = Promise.resolve(null);
      return;
    }

    this.firstState = new Promise<User | null>((resolve) => {
      let settled = false;

      const unsubscribe = onAuthStateChanged(auth, (user) => {
        this.currentUser.set(user);
        this.resolved.set(true);

        if (!settled) {
          settled = true;
          resolve(user);
        }
      });

      this.destroyRef.onDestroy(unsubscribe);
    });
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
    if (!this.auth) {
      throw new Error('حصلت مشكلة، حاول تاني');
    }

    try {
      const credential = await signInWithEmailAndPassword(this.auth, email.trim(), password);
      return credential.user;
    } catch (error) {
      throw new Error(messageFor(errorCodeOf(error)));
    }
  }

  async signOut(): Promise<void> {
    if (!this.auth) {
      return;
    }
    await firebaseSignOut(this.auth);
  }
}
