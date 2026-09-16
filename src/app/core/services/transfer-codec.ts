import type { Timestamp } from 'firebase/firestore';

/**
 * Codec for values crossing TransferState.
 *
 * TransferState is serialised as JSON, and a Firestore `Timestamp` does not
 * survive that round trip: it would arrive as a plain `{seconds, nanoseconds}`
 * object with no `toDate()`. So timestamps are marked on the way out and
 * rebuilt on the way in.
 *
 * Nothing here imports the Firestore SDK at runtime — only `import type`,
 * which erases. Decoding runs on the hydrating client's first load, and
 * pulling ~460kB of Firestore in just to reconstruct two fields would undo
 * the whole point of the transfer cache.
 *
 * So a timestamp is recognised by its shape rather than by `instanceof`, and
 * rebuilt as the stand-in below.
 */

const TIMESTAMP_MARKER = '__firestoreTimestamp__';

interface EncodedTimestamp {
  readonly [TIMESTAMP_MARKER]: true;
  readonly seconds: number;
  readonly nanoseconds: number;
}

interface TimestampShape {
  readonly seconds: number;
  readonly nanoseconds: number;
  toDate(): Date;
}

/**
 * A transferred timestamp.
 *
 * It implements everything this project ever calls on a `Timestamp` —
 * `seconds`, `nanoseconds`, `toDate`, `toMillis`, `isEqual`, `valueOf`,
 * `toJSON`, `toString` — but it is not the SDK's class, so
 * `instanceof Timestamp` is false for it and `toInstant()` is absent.
 *
 * That is fine on the path it is used on: transferred vehicles and settings
 * are read for display only, and every value that goes back to Firestore is
 * written with `serverTimestamp()`.
 */
class TransferredTimestamp implements TimestampShape {
  constructor(
    readonly seconds: number,
    readonly nanoseconds: number,
  ) {}

  toDate(): Date {
    return new Date(this.toMillis());
  }

  toMillis(): number {
    return this.seconds * 1000 + this.nanoseconds / 1e6;
  }

  isEqual(other: TimestampShape): boolean {
    return other.seconds === this.seconds && other.nanoseconds === this.nanoseconds;
  }

  valueOf(): string {
    return String(this.toMillis());
  }

  toJSON(): { seconds: number; nanoseconds: number; type: string } {
    return { seconds: this.seconds, nanoseconds: this.nanoseconds, type: 'timestamp' };
  }

  toString(): string {
    return `Timestamp(seconds=${this.seconds}, nanoseconds=${this.nanoseconds})`;
  }
}

/** Duck-typing, because the real class is not loaded here. */
function isTimestampLike(value: object): value is TimestampShape {
  const candidate = value as Partial<TimestampShape>;
  return (
    typeof candidate.seconds === 'number' &&
    typeof candidate.nanoseconds === 'number' &&
    typeof candidate.toDate === 'function'
  );
}

function isEncodedTimestamp(value: object): value is EncodedTimestamp {
  return TIMESTAMP_MARKER in value;
}

export function encodeForTransfer(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(encodeForTransfer);
  }

  if (value !== null && typeof value === 'object') {
    if (isTimestampLike(value)) {
      return {
        [TIMESTAMP_MARKER]: true,
        seconds: value.seconds,
        nanoseconds: value.nanoseconds,
      } satisfies EncodedTimestamp;
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        encodeForTransfer(item),
      ]),
    );
  }

  return value;
}

/** Inverse of {@link encodeForTransfer}. */
export function decodeFromTransfer(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decodeFromTransfer);
  }

  if (value !== null && typeof value === 'object') {
    if (isEncodedTimestamp(value)) {
      // The stand-in stands where the SDK's class would be. See the note above.
      return new TransferredTimestamp(value.seconds, value.nanoseconds) as unknown as Timestamp;
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        decodeFromTransfer(item),
      ]),
    );
  }

  return value;
}
