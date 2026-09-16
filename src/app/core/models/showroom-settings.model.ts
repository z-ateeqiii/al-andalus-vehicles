import type { Timestamp } from 'firebase/firestore';

/** The single document at `settings/showroom`. */
export interface ShowroomSettings {
  showroomName: string;
  whatsappNumber: string; // international format, no +
  phoneNumber?: string;
  address?: string;
  workingHours?: string;
  /** Empty or absent hides the icon from the footer entirely. */
  facebookUrl?: string;
  tiktokUrl?: string;
  heroImageUrl: string;
  heroHeading: string;
  heroSubheading: string;
  heroDescription: string;
  showPassengerVehicles: boolean;
  updatedAt: Timestamp;
}

/** Everything the settings screen can change. `updatedAt` is stamped by the service. */
export type ShowroomSettingsDraft = Omit<ShowroomSettings, 'updatedAt'>;

/**
 * Bundled fallback for the hero and contact details, used only when
 * `settings/showroom` is missing or unreadable — §6.2 of the build spec calls
 * for a sensible fallback so the home page never renders empty.
 *
 * This is NOT a fallback for vehicles: the catalogue reads from Firestore only.
 */
export const DEFAULT_SHOWROOM_SETTINGS: ShowroomSettingsDraft = {
  showroomName: 'معرض الأندلس',
  whatsappNumber: '',
  heroImageUrl: '',
  heroHeading: 'الأندلس',
  heroSubheading: 'لبيع وشراء السيارات',
  heroDescription: 'سيارات ربع نقل شيفروليه .. وجودة تضمن لك الطريق',
  showPassengerVehicles: true,
};
