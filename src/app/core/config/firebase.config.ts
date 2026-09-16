import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';

/**
 * Firebase Web SDK wired directly — no AngularFire (CLAUDE.md §2).
 *
 * Every import here is `import type`, and the SDK itself is pulled in with
 * `import()` at the moment it is first needed. That keeps roughly 460kB of
 * Firestore and Auth out of the initial chunk.
 *
 * This is safe because of TransferState: the server fetches the vehicles and
 * settings a public page needs, and the hydrating browser reads them straight
 * out of the transferred state without touching Firestore. The SDK only loads
 * for the visit counter (after first render), for a client-side navigation
 * that misses the transfer cache, and in the admin area.
 */

const APP_NAME = 'al-andalus';

/** The whole module, typed without being imported at runtime. */
type FirestoreModule = typeof import('firebase/firestore');
type AuthModule = typeof import('firebase/auth');

export interface FirestoreApi {
  readonly db: Firestore;
  /** `fs.getDocs`, `fs.query`, `fs.Timestamp`, … */
  readonly fs: FirestoreModule;
}

export interface AuthApi {
  readonly auth: Auth;
  readonly fa: AuthModule;
}

let appPromise: Promise<FirebaseApp> | null = null;
let firestorePromise: Promise<FirestoreApi> | null = null;
let authPromise: Promise<AuthApi> | null = null;

async function loadApp(): Promise<FirebaseApp> {
  appPromise ??= import('firebase/app').then(({ getApp, getApps, initializeApp }) =>
    getApps().some((app) => app.name === APP_NAME)
      ? getApp(APP_NAME)
      : initializeApp(environment.firebase, APP_NAME),
  );

  return appPromise;
}

/**
 * Firestore, loaded on first use and cached for the life of the page.
 * Runs on both platforms — the server reads through it to render public pages.
 */
export async function loadFirestore(): Promise<FirestoreApi> {
  firestorePromise ??= (async () => {
    const [app, fs] = await Promise.all([loadApp(), import('firebase/firestore')]);
    return { db: fs.getFirestore(app), fs };
  })();

  return firestorePromise;
}

/**
 * Auth, browser-only. Callers must treat a rejection-free `null` from
 * {@link loadAuthIfBrowser} as "nobody is signed in".
 */
export async function loadAuth(): Promise<AuthApi> {
  authPromise ??= (async () => {
    const [app, fa] = await Promise.all([loadApp(), import('firebase/auth')]);

    try {
      // Local persistence keeps the owner signed in between visits. Skipping
      // the popup/redirect resolver keeps this to email/password only.
      return { auth: fa.initializeAuth(app, { persistence: fa.browserLocalPersistence }), fa };
    } catch {
      // Already initialised — happens on a hot reload.
      return { auth: fa.getAuth(app), fa };
    }
  })();

  return authPromise;
}

/**
 * `null` on the server. There is no signed-in user during SSR, and
 * initialising Auth there would reach for browser storage.
 *
 * Call this from an injection context.
 */
export function loadAuthIfBrowser(): Promise<AuthApi | null> {
  return isPlatformBrowser(inject(PLATFORM_ID)) ? loadAuth() : Promise.resolve(null);
}
