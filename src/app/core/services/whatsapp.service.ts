import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { VEHICLE_CATEGORY_LABELS, Vehicle } from '../models/vehicle.model';
import { SettingsService } from './settings.service';

/** `545000` → `545,000`. Latin digits, matching the design's use of Inter. */
function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US').format(price);
}

/**
 * The whole sales funnel ends here: a pre-filled WhatsApp chat.
 *
 * The number comes from `settings/showroom` so the owner can change it
 * without a deploy, falling back to the environment value. It is never read
 * directly by a component (CLAUDE.md §5).
 */
@Injectable({ providedIn: 'root' })
export class WhatsAppService {
  private readonly settings = inject(SettingsService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Read synchronously so a click can open the tab in the same turn — after
   * an await, the browser treats the new tab as an unsolicited popup.
   */
  get number(): string {
    return this.settings.current()?.whatsappNumber || environment.whatsappNumber;
  }

  /**
   * The enquiry message from build spec §6.6. Any line whose value is missing
   * is left out entirely — no empty labels, no dashes.
   */
  buildMessage(vehicle: Vehicle): string {
    const lines: string[] = ['السلام عليكم، أنا مهتم بالعربية دي:', ''];

    if (vehicle.brand) {
      lines.push(`الماركة: ${vehicle.brand}`);
    }
    if (vehicle.model) {
      lines.push(`الموديل: ${vehicle.model}`);
    }
    if (vehicle.year) {
      lines.push(`السنة: ${vehicle.year}`);
    }
    if (vehicle.category) {
      lines.push(`النوع: ${VEHICLE_CATEGORY_LABELS[vehicle.category]}`);
    }
    if (!vehicle.priceOnRequest && typeof vehicle.price === 'number' && vehicle.price > 0) {
      lines.push(`السعر: ${formatPrice(vehicle.price)} جنيه`);
    }

    lines.push('', 'ممكن أعرف تفاصيل أكتر؟');

    return lines.join('\n');
  }

  chatUrl(message: string, number = this.number): string {
    const digits = number.replace(/\D/g, '');
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  }

  /** Opens the chat for one vehicle, pre-filled with its details. */
  openForVehicle(vehicle: Vehicle): void {
    this.open(this.buildMessage(vehicle));
  }

  /** The plain `تواصل معانا` buttons, with no vehicle attached. */
  openGeneral(message = 'السلام عليكم، حابب أستفسر عن العربيات المتاحة عندكم.'): void {
    this.open(message);
  }

  private open(message: string): void {
    if (!this.isBrowser) {
      return;
    }
    window.open(this.chatUrl(message), '_blank', 'noopener,noreferrer');
  }
}
