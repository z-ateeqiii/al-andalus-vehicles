import { Injectable, inject } from '@angular/core';
import { DocumentData, Timestamp, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { environment } from '../../../environments/environment';
import { FIRESTORE } from '../config/firebase.config';
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
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly firestore = inject(FIRESTORE);
  private readonly transferCache = inject(TransferCacheService);

  /**
   * Never rejects and never resolves to null: a missing or unreadable
   * settings document falls back to the bundled defaults so the home page
   * still renders. The WhatsApp number falls back to the environment value.
   */
  load(): Promise<ShowroomSettings> {
    return this.transferCache.through('settings:showroom', async () => {
      try {
        const snapshot = await getDoc(doc(this.firestore, COLLECTION, DOCUMENT_ID));
        return snapshot.exists() ? this.merge(snapshot.data()) : this.merge(null);
      } catch {
        return this.merge(null);
      }
    });
  }

  /** Admin write. Creates the document if the owner is saving for the first time. */
  async save(draft: ShowroomSettingsDraft): Promise<void> {
    await setDoc(
      doc(this.firestore, COLLECTION, DOCUMENT_ID),
      { ...draft, updatedAt: serverTimestamp() },
      { merge: true },
    );
  }

  /**
   * Fills any gap in the stored document from the bundled defaults, so a
   * partially-filled settings document can never render a blank hero.
   */
  private merge(data: DocumentData | null): ShowroomSettings {
    const stored = (data ?? {}) as Partial<ShowroomSettings>;

    return {
      ...DEFAULT_SHOWROOM_SETTINGS,
      ...stored,
      whatsappNumber: stored.whatsappNumber || environment.whatsappNumber,
      showPassengerVehicles:
        typeof stored.showPassengerVehicles === 'boolean'
          ? stored.showPassengerVehicles
          : DEFAULT_SHOWROOM_SETTINGS.showPassengerVehicles,
      updatedAt: stored.updatedAt instanceof Timestamp ? stored.updatedAt : Timestamp.now(),
    };
  }
}
