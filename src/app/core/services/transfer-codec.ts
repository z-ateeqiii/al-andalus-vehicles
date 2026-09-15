import { Timestamp } from 'firebase/firestore';

/**
 * Codec for values crossing TransferState.
 *
 * TransferState is serialised as JSON, and a Firestore `Timestamp` does not
 * survive that round trip: it would arrive as a plain `{seconds, nanoseconds}`
 * object with no `toDate()`. So timestamps are marked on the way out and
 * rebuilt into real `Timestamp` instances on the way in.
 *
 * Deliberately free of Angular imports — these are pure functions.
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

/** Exported so the round trip can be exercised directly. */
export function encodeForTransfer(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return {
      [TIMESTAMP_MARKER]: true,
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    } satisfies EncodedTimestamp;
  }

  if (Array.isArray(value)) {
    return value.map(encodeForTransfer);
  }

  if (value !== null && typeof value === 'object') {
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
      const encoded = value as EncodedTimestamp;
      return new Timestamp(encoded.seconds, encoded.nanoseconds);
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
