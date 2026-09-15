import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, TransferState, inject, makeStateKey } from '@angular/core';
import { Timestamp } from 'firebase/firestore';

/**
 * Carries server-fetched Firestore data into the hydrating client.
 *
 * Angular's hydration transfer cache only covers `HttpClient`, and the
 * Firebase SDK does not go through it — so without this every public page
 * would fetch once on the server and again in the browser, which shows up as
 * a flicker (CLAUDE.md §5).
 *
 * TransferState is serialised as JSON, and a Firestore `Timestamp` does not
 * survive that round trip: it would arrive as a plain `{seconds, nanoseconds}`
 * object with no `toDate()`. So timestamps are marked on the way out and
 * rebuilt into real `Timestamp` instances on the way in.
 */

const TIMESTAMP_MARKER = '__firestoreTimestamp__';

interface EncodedTimestamp {
  readonly [TIMESTAMP_MARKER]: true;
  readonly seconds: number;
  readonly nanoseconds: number;
}

function isEncodedTimestamp(value: object): value is EncodedTimestamp {
  return TIMESTAMP_MARKER in value;
}

function encode(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return {
      [TIMESTAMP_MARKER]: true,
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    } satisfies EncodedTimestamp;
  }

  if (Array.isArray(value)) {
    return value.map(encode);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, encode(item)]),
    );
  }

  return value;
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decode);
  }

  if (value !== null && typeof value === 'object') {
    if (isEncodedTimestamp(value)) {
      const encoded = value as EncodedTimestamp;
      return new Timestamp(encoded.seconds, encoded.nanoseconds);
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, decode(item)]),
    );
  }

  return value;
}

@Injectable({ providedIn: 'root' })
export class TransferCacheService {
  private readonly transferState = inject(TransferState);
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
      return decode(transferred) as T;
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      return pending as Promise<T>;
    }

    const request = read()
      .then((value) => {
        if (!this.isBrowser) {
          this.transferState.set(stateKey, encode(value));
        }
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, request);
    return request;
  }
}
