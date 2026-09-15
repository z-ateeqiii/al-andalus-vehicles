import { isPlatformBrowser } from '@angular/common';
import { InjectionToken, PLATFORM_ID, inject } from '@angular/core';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, browserLocalPersistence, getAuth, initializeAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { environment } from '../../../environments/environment';

/**
 * Firebase Web SDK wired directly — no AngularFire (CLAUDE.md §2).
 *
 * Firestore runs on both platforms: the server reads vehicles and settings so
 * the public pages can be server-rendered. Auth is browser-only — there is no
 * signed-in user during SSR and initialising it on the server would reach for
 * browser storage.
 */

const APP_NAME = 'al-andalus';

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP', {
  providedIn: 'root',
  factory: () =>
    getApps().some((app) => app.name === APP_NAME)
      ? getApp(APP_NAME)
      : initializeApp(environment.firebase, APP_NAME),
});

export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE', {
  providedIn: 'root',
  factory: () => getFirestore(inject(FIREBASE_APP)),
});

/**
 * `null` on the server. Every consumer must treat that as "nobody is signed
 * in" rather than waiting on it.
 */
export const FIREBASE_AUTH = new InjectionToken<Auth | null>('FIREBASE_AUTH', {
  providedIn: 'root',
  factory: () => {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return null;
    }

    const app = inject(FIREBASE_APP);
    try {
      // Local persistence keeps the owner signed in between visits. Skipping
      // the popup/redirect resolver keeps the bundle to email/password only.
      return initializeAuth(app, { persistence: browserLocalPersistence });
    } catch {
      // Already initialised — happens on a hot reload.
      return getAuth(app);
    }
  },
});
