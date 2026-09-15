import { Timestamp } from 'firebase/firestore';

export type VehicleCategory = 'pickup' | 'passenger';
export type VehicleStatus = 'available' | 'reserved' | 'sold' | 'hidden';

/** One document in `vehicles/{vehicleId}`. */
export interface Vehicle {
  id: string;
  category: VehicleCategory;
  brand: string;
  model: string;
  year: number;
  price: number | null; // null when priceOnRequest
  priceOnRequest: boolean; // shows "السعر عند الاتصال"
  currency: 'EGP';
  color?: string; // Arabic name
  colorHex?: string; // for the dot on the card
  mileage?: number;
  condition?: 'new' | 'used';
  engine?: string;
  power?: string;
  transmission?: string;
  fuelType?: string;
  payload?: string; // pickups
  bedType?: string; // pickups
  description?: string;
  features?: string[];
  coverImageUrl: string;
  imageUrls: string[];
  status: VehicleStatus;
  isFeatured?: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** What an admin form supplies. `id` and the timestamps are set by the service. */
export type VehicleDraft = Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * The statuses a visitor is allowed to see. `sold` and `hidden` never leave
 * the admin area.
 */
export const PUBLIC_VEHICLE_STATUSES: readonly VehicleStatus[] = ['available', 'reserved'];

export const VEHICLE_CATEGORY_LABELS: Record<VehicleCategory, string> = {
  pickup: 'نص نقل',
  passenger: 'ملاكي',
};

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  available: 'متاحة',
  reserved: 'محجوزة',
  sold: 'مباعة',
  hidden: 'مخفية',
};

export function isPubliclyVisible(vehicle: Vehicle): boolean {
  return PUBLIC_VEHICLE_STATUSES.includes(vehicle.status);
}
