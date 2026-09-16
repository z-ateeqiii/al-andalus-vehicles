import { Injectable, inject, signal } from '@angular/core';
import type { DocumentData } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { FirestoreApi, loadFirestore } from '../config/firebase.config';
import {
  DEFAULT_SHOWROOM_SETTINGS,
  ShowroomSettings,
  ShowroomSettingsDraft,
} from '../models/showroom-settings.model';
import { TransferCacheService } from './transfer-cache.service';

const COLLECTION = 'settings';
const DOCUMENT_ID = 'showroom';

/**
 * Reads and writes the single `settings/showroom` document — the hero, the
 * contact details and the ملاكي toggle.
 *
 * The owner changes the hero image and copy from `/admin/settings`, with no
 * code change and no deploy (build spec §8.5).
 *
 * The Firestore SDK is loaded with `import()` on first use; on the client's
 * first load the transfer cache answers before that happens.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly transferCache = inject(TransferCacheService);

  private readonly loaded = signal<ShowroomSettings | null>(null);

  /**
   * The last settings read, or `null` before the first one completes.
   *
   * Exists so callers that must act inside a user gesture — opening the
   * WhatsApp tab, which a popup blocker kills if it happens after an await —
   * can read the number synchronously.
   */
  readonly current = this.loaded.asReadonly();

  /**
   * Never rejects and never resolves to null: a missing or unreadable
   * settings document falls back to the bundled defaults so the home page
   * still renders. The WhatsApp number falls back to the environment value.
   */
  async load(): Promise<ShowroomSettings> {
    const settings = await this.transferCache.through('settings:showroom', async () => {
      try {
        const api = await loadFirestore();
        const snapshot = await api.fs.getDoc(api.fs.doc(api.db, COLLECTION, DOCUMENT_ID));
        return this.merge(snapshot.exists() ? snapshot.data() : null, api);
      } catch {
        return this.merge(null, null);
      }
    });

    this.loaded.set(settings);
    return settings;
  }

  /** Admin write. Creates the document if the owner is saving for the first time. */
  async save(draft: ShowroomSettingsDraft): Promise<void> {
    const api = await loadFirestore();
    const { db, fs } = api;

    await fs.setDoc(
      fs.doc(db, COLLECTION, DOCUMENT_ID),
      { ...draft, updatedAt: fs.serverTimestamp() },
      { merge: true },
    );

    // Keep the synchronous readers in step with what was just saved.
    this.loaded.set(this.merge(draft as DocumentData, api));
  }

  /**
   * Fills any gap in the stored document from the bundled defaults, so a
   * partially-filled settings document can never render a blank hero.
   *
   * `api` is null only when Firestore could not be loaded at all, in which
   * case there is no stored timestamp to preserve either.
   */
  private merge(data: DocumentData | null, api: FirestoreApi | null): ShowroomSettings {
    const stored = (data ?? {}) as Partial<ShowroomSettings>;
    const Timestamp = api?.fs.Timestamp;

    const updatedAt =
      Timestamp && stored.updatedAt instanceof Timestamp
        ? stored.updatedAt
        : (Timestamp?.now() ?? fallbackTimestamp());

    return {
      ...DEFAULT_SHOWROOM_SETTINGS,
      ...stored,
      whatsappNumber: stored.whatsappNumber || environment.whatsappNumber,
      showPassengerVehicles:
        typeof stored.showPassengerVehicles === 'boolean'
          ? stored.showPassengerVehicles
          : DEFAULT_SHOWROOM_SETTINGS.showPassengerVehicles,
      updatedAt,
    };
  }
}

/**
 * Stands in for `Timestamp.now()` when the SDK is unavailable — the settings
 * document is display-only, and nothing reads this field.
 */
function fallbackTimestamp(): ShowroomSettings['updatedAt'] {
  const millis = Date.now();
  return {
    seconds: Math.floor(millis / 1000),
    nanoseconds: (millis % 1000) * 1e6,
    toDate: () => new Date(millis),
    toMillis: () => millis,
  } as ShowroomSettings['updatedAt'];
}
