import { Injectable, inject } from '@angular/core';
import type { DocumentData, DocumentSnapshot, QueryDocumentSnapshot } from 'firebase/firestore';
import { FirestoreApi, loadFirestore } from '../config/firebase.config';
import {
  PUBLIC_VEHICLE_STATUSES,
  Vehicle,
  VehicleCategory,
  VehicleDraft,
  VehicleStatus,
  isPubliclyVisible,
} from '../models/vehicle.model';
import { TransferCacheService } from './transfer-cache.service';

const COLLECTION = 'vehicles';

/** Firestore rejects `undefined`; `null` is meaningful (an unpriced vehicle). */
function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}

function toVehicle(
  snapshot: DocumentSnapshot | QueryDocumentSnapshot,
  { fs }: FirestoreApi,
): Vehicle {
  const data = snapshot.data() as DocumentData;

  return {
    ...(data as Omit<Vehicle, 'id'>),
    id: snapshot.id,
    // A half-written document must not take a page down.
    imageUrls: Array.isArray(data['imageUrls']) ? (data['imageUrls'] as string[]) : [],
    createdAt: data['createdAt'] instanceof fs.Timestamp ? data['createdAt'] : fs.Timestamp.now(),
    updatedAt: data['updatedAt'] instanceof fs.Timestamp ? data['updatedAt'] : fs.Timestamp.now(),
  };
}

/**
 * Reads and writes `vehicles/{vehicleId}`.
 *
 * Public reads go through `TransferCacheService` so the server's fetch
 * hydrates the browser instead of running twice. Admin reads do not — those
 * routes are client-rendered, and their data has no business appearing in the
 * page source.
 *
 * A showroom holds tens of vehicles, not thousands, so the public catalogue is
 * one query and the inventory filters (category, brand, price, search) run in
 * memory. That keeps Firestore to a single composite index instead of one per
 * filter combination.
 *
 * The Firestore SDK is loaded with `import()` inside each method. On the
 * client's first load none of these bodies run — the transfer cache answers
 * before `read()` is reached — so the SDK never enters the critical path.
 */
@Injectable({ providedIn: 'root' })
export class VehicleService {
  private readonly transferCache = inject(TransferCacheService);

  /** Everything a visitor is allowed to see, newest first. */
  listPublic(): Promise<Vehicle[]> {
    return this.transferCache.through('vehicles:public', async () => {
      const api = await loadFirestore();
      const { db, fs } = api;

      const snapshot = await fs.getDocs(
        fs.query(
          fs.collection(db, COLLECTION),
          fs.where('status', 'in', [...PUBLIC_VEHICLE_STATUSES]),
          fs.orderBy('createdAt', 'desc'),
        ),
      );

      return snapshot.docs.map((doc) => toVehicle(doc, api));
    });
  }

  /** `null` for a missing vehicle and for one that is sold or hidden. */
  getPublic(id: string): Promise<Vehicle | null> {
    return this.transferCache.through(`vehicle:${id}`, async () => {
      const api = await loadFirestore();
      const { db, fs } = api;

      const snapshot = await fs.getDoc(fs.doc(db, COLLECTION, id));
      if (!snapshot.exists()) {
        return null;
      }

      const vehicle = toVehicle(snapshot, api);
      return isPubliclyVisible(vehicle) ? vehicle : null;
    });
  }

  /** Admin only — includes sold and hidden vehicles. */
  async listAll(): Promise<Vehicle[]> {
    const api = await loadFirestore();
    const { db, fs } = api;

    const snapshot = await fs.getDocs(
      fs.query(fs.collection(db, COLLECTION), fs.orderBy('createdAt', 'desc')),
    );

    return snapshot.docs.map((doc) => toVehicle(doc, api));
  }

  /** Admin only — any status. */
  async get(id: string): Promise<Vehicle | null> {
    const api = await loadFirestore();
    const snapshot = await api.fs.getDoc(api.fs.doc(api.db, COLLECTION, id));
    return snapshot.exists() ? toVehicle(snapshot, api) : null;
  }

  /** Resolves to the new document id. */
  async create(draft: VehicleDraft): Promise<string> {
    const { db, fs } = await loadFirestore();

    const reference = await fs.addDoc(fs.collection(db, COLLECTION), {
      ...stripUndefined(draft),
      createdAt: fs.serverTimestamp(),
      updatedAt: fs.serverTimestamp(),
    });

    return reference.id;
  }

  async update(id: string, patch: Partial<VehicleDraft>): Promise<void> {
    const { db, fs } = await loadFirestore();

    await fs.updateDoc(fs.doc(db, COLLECTION, id), {
      ...stripUndefined(patch),
      updatedAt: fs.serverTimestamp(),
    });
  }

  /** The status `<select>` on each admin row saves through this. */
  async updateStatus(id: string, status: VehicleStatus): Promise<void> {
    const { db, fs } = await loadFirestore();

    await fs.updateDoc(fs.doc(db, COLLECTION, id), {
      status,
      updatedAt: fs.serverTimestamp(),
    });
  }

  async remove(id: string): Promise<void> {
    const { db, fs } = await loadFirestore();
    await fs.deleteDoc(fs.doc(db, COLLECTION, id));
  }

  // ── Pure helpers. The spec asks for these to be derived from the real
  //    documents rather than hardcoded. No Firestore involved. ──────────────

  /** Up to `limit` featured vehicles, for the home page band. */
  featured(vehicles: readonly Vehicle[], limit = 6): Vehicle[] {
    return vehicles.filter((vehicle) => vehicle.isFeatured).slice(0, limit);
  }

  /** Brand filter options, in Arabic collation order. */
  distinctBrands(vehicles: readonly Vehicle[]): string[] {
    const brands = new Set(vehicles.map((vehicle) => vehicle.brand).filter(Boolean));
    return [...brands].sort((a, b) => a.localeCompare(b, 'ar'));
  }

  /** Feeds the dashboard's category split bar. */
  countByCategory(vehicles: readonly Vehicle[]): Record<VehicleCategory, number> {
    return vehicles.reduce(
      (counts, vehicle) => {
        counts[vehicle.category] += 1;
        return counts;
      },
      // Written out rather than cast, so adding a category is a compile
      // error here instead of a silent NaN in the dashboard.
      { pickup: 0, minibus: 0, passenger: 0 } satisfies Record<VehicleCategory, number>,
    );
  }

  countByStatus(vehicles: readonly Vehicle[]): Record<VehicleStatus, number> {
    return vehicles.reduce(
      (counts, vehicle) => {
        counts[vehicle.status] += 1;
        return counts;
      },
      { available: 0, reserved: 0, sold: 0, hidden: 0 } satisfies Record<VehicleStatus, number>,
    );
  }

  /** `[min, max]` across priced vehicles, or `null` when none carry a price. */
  priceRange(vehicles: readonly Vehicle[]): readonly [number, number] | null {
    const prices = vehicles
      .map((vehicle) => vehicle.price)
      .filter((price): price is number => typeof price === 'number' && price > 0);

    return prices.length ? [Math.min(...prices), Math.max(...prices)] : null;
  }
}
