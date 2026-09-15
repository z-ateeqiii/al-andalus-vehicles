import { isPlatformBrowser } from '@angular/common';
import {
  Injectable,
  PLATFORM_ID,
  PendingTasks,
  TransferState,
  inject,
  makeStateKey,
} from '@angular/core';
import { decodeFromTransfer, encodeForTransfer } from './transfer-codec';

/**
 * Carries server-fetched Firestore data into the hydrating client.
 *
 * Angular's hydration transfer cache only covers `HttpClient`, and the
 * Firebase SDK does not go through it — so without this every public page
 * would fetch once on the server and again in the browser, which shows up as
 * a flicker (CLAUDE.md §5).
 */

@Injectable({ providedIn: 'root' })
export class TransferCacheService {
  private readonly transferState = inject(TransferState);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Collapses concurrent reads of the same key into one Firestore request. */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  /**
   * Runs `read` on the server and stores the result; on the client, returns
   * what the server already fetched and only falls back to `read` when there
   * is nothing stored (a client-rendered route, or a second navigation).
   *
   * The key must identify the query exactly — the server and the client have
   * to agree on it or the client re-fetches.
   */
  async through<T>(key: string, read: () => Promise<T>): Promise<T> {
    const stateKey = makeStateKey<unknown>(key);

    if (this.isBrowser && this.transferState.hasKey(stateKey)) {
      const transferred = this.transferState.get(stateKey, null);
      // Read once: a later navigation should hit Firestore for fresh data.
      this.transferState.remove(stateKey);
      return decodeFromTransfer(transferred) as T;
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      return pending as Promise<T>;
    }

    // Holds the application "unstable" until the read resolves. Without this
    // the server serialises the page before Firestore answers, and every
    // server-rendered route ships empty markup with nothing in TransferState.
    const taskDone = this.pendingTasks.add();

    const request = read()
      .then((value) => {
        if (!this.isBrowser) {
          this.transferState.set(stateKey, encodeForTransfer(value));
        }
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
        taskDone();
      });

    this.inFlight.set(key, request);
    return request;
  }
}
