import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { loadFirestore } from '../config/firebase.config';

const COLLECTION = 'analytics';
const TOTAL_DOCUMENT = 'total';
const SESSION_KEY = 'al-andalus:visit-counted';

/** `daily_2026-09-16`, in the visitor's own timezone. */
function dailyDocumentId(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `daily_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * One metric: how many people visited. Nothing else.
 *
 * No per-vehicle views, no sales, nothing fabricated (CLAUDE.md §1). The
 * dashboard card is labelled `زوار الموقع`.
 *
 * Counting is browser-only and deduplicated per session. If it ran during SSR
 * every link-preview crawler — and the owner pasting a link into WhatsApp —
 * would inflate the number.
 *
 * This is the one public-side caller that genuinely needs Firestore in the
 * browser, so it is also the one that decides when that chunk downloads. It
 * is invoked from `afterNextRender`, which means the `import()` starts after
 * the first paint rather than competing with it.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Adds exactly one view to `analytics/total` and today's `analytics/daily_*`,
   * the first time it is called in a browser session.
   *
   * Never throws: a blocked or rule-rejected counter must not take a public
   * page down.
   */
  async recordVisit(): Promise<void> {
    if (!this.isBrowser || this.alreadyCounted()) {
      return;
    }

    // Marked before the await, so two calls in the same tick cannot both pass.
    this.markCounted();

    try {
      const { db, fs } = await loadFirestore();
      const views = { views: fs.increment(1) };

      await Promise.all([
        fs.setDoc(fs.doc(db, COLLECTION, TOTAL_DOCUMENT), views, { merge: true }),
        fs.setDoc(fs.doc(db, COLLECTION, dailyDocumentId()), views, { merge: true }),
      ]);
    } catch {
      // Counting is best-effort by design.
    }
  }

  /** Admin read — the `زوار الموقع` card. Resolves to 0 when unavailable. */
  async totalViews(): Promise<number> {
    try {
      const { db, fs } = await loadFirestore();
      const snapshot = await fs.getDoc(fs.doc(db, COLLECTION, TOTAL_DOCUMENT));
      const views: unknown = snapshot.data()?.['views'];
      return typeof views === 'number' ? views : 0;
    } catch {
      return 0;
    }
  }

  private alreadyCounted(): boolean {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      // Storage blocked: count this view rather than losing every visitor.
      return false;
    }
  }

  private markCounted(): void {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      // Nothing to do — the visit is simply counted again next navigation.
    }
  }
}
