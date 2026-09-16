import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, REQUEST, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { environment } from '../../../environments/environment';
import { VEHICLE_CATEGORY_LABELS, Vehicle } from '../models/vehicle.model';
import { ShowroomSettings } from '../models/showroom-settings.model';
import { CloudinaryService } from './cloudinary.service';

export interface PageSeo {
  readonly title: string;
  readonly description: string;
  /** Absolute path, e.g. `/vehicles`. */
  readonly path: string;
  readonly image?: string;
}

const JSON_LD_ATTRIBUTE = 'data-seo-jsonld';
const SITE_NAME = 'معرض الأندلس';

/**
 * Titles, meta, Open Graph, Twitter cards and `schema.org` JSON-LD.
 *
 * This is the reason SSR exists on this project: the owner and customers
 * paste vehicle links into WhatsApp and Facebook, and those previews are
 * built from server-rendered tags (CLAUDE.md §5).
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly cloudinary = inject(CloudinaryService);
  private readonly request = inject(REQUEST, { optional: true });
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * The origin this response is being served from.
   *
   * Taken from the request so preview deployments and the production domain
   * both produce correct absolute URLs, with the environment value as a
   * last resort.
   */
  origin(): string {
    if (this.request?.url) {
      try {
        return new URL(this.request.url).origin;
      } catch {
        // Fall through to the other sources.
      }
    }

    if (this.isBrowser) {
      return this.document.location.origin;
    }

    return environment.siteUrl;
  }

  absolute(path: string): string {
    const origin = this.origin();
    return origin ? `${origin}${path}` : path;
  }

  /** A plain page: no product markup. */
  applyPage(page: PageSeo): void {
    this.removeJsonLd();
    this.applyCommon(page);
  }

  /** A vehicle: full preview card plus `Car` + `Offer` JSON-LD. */
  applyVehicle(vehicle: Vehicle, settings: ShowroomSettings | null): void {
    const name = `${vehicle.brand} ${vehicle.model} ${vehicle.year}`.trim();
    const category = VEHICLE_CATEGORY_LABELS[vehicle.category];
    const price = vehicle.priceOnRequest || vehicle.price === null ? null : vehicle.price;

    const description =
      vehicle.description?.trim() ||
      [
        `${name} ${category} للبيع في ${settings?.showroomName ?? SITE_NAME}`,
        price ? `بسعر ${new Intl.NumberFormat('en-US').format(price)} جنيه` : 'السعر عند الاتصال',
      ].join(' — ');

    this.applyCommon({
      title: `${name} — ${category}`,
      description,
      path: `/vehicles/${vehicle.id}`,
      image: vehicle.coverImageUrl,
    });

    this.setJsonLd(this.vehicleJsonLd(vehicle, name, description, price));
  }

  private applyCommon(page: PageSeo): void {
    const fullTitle = `${page.title} | ${SITE_NAME}`;
    const url = this.absolute(page.path);
    const image = page.image ? this.cloudinary.transform(page.image, 1200) : '';

    this.title.setTitle(fullTitle);
    this.meta.updateTag({ name: 'description', content: page.description });

    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.meta.updateTag({ property: 'og:locale', content: 'ar_EG' });
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:description', content: page.description });
    this.meta.updateTag({ property: 'og:url', content: url });

    this.meta.updateTag({ name: 'twitter:title', content: fullTitle });
    this.meta.updateTag({ name: 'twitter:description', content: page.description });

    if (image) {
      this.meta.updateTag({ property: 'og:image', content: image });
      this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
      this.meta.updateTag({ name: 'twitter:image', content: image });
    } else {
      this.meta.removeTag('property="og:image"');
      this.meta.updateTag({ name: 'twitter:card', content: 'summary' });
      this.meta.removeTag('name="twitter:image"');
    }

    this.setCanonical(url);
  }

  private vehicleJsonLd(
    vehicle: Vehicle,
    name: string,
    description: string,
    price: number | null,
  ): Record<string, unknown> {
    const car: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Car',
      name,
      description,
      brand: { '@type': 'Brand', name: vehicle.brand },
      model: vehicle.model,
      vehicleModelDate: String(vehicle.year),
      url: this.absolute(`/vehicles/${vehicle.id}`),
    };

    if (vehicle.coverImageUrl) {
      car['image'] = this.cloudinary.transform(vehicle.coverImageUrl, 1200);
    }
    if (vehicle.color) {
      car['color'] = vehicle.color;
    }
    if (vehicle.fuelType) {
      car['fuelType'] = vehicle.fuelType;
    }
    if (vehicle.transmission) {
      car['vehicleTransmission'] = vehicle.transmission;
    }
    if (typeof vehicle.mileage === 'number') {
      car['mileageFromOdometer'] = {
        '@type': 'QuantitativeValue',
        value: vehicle.mileage,
        unitCode: 'KMT',
      };
    }
    // Body type lets a search engine tell a ميكروباص from a ربع نقل, which
    // the name alone does not.
    car['bodyType'] = VEHICLE_CATEGORY_LABELS[vehicle.category];

    if (typeof vehicle.seats === 'number') {
      car['vehicleSeatingCapacity'] = {
        '@type': 'QuantitativeValue',
        value: vehicle.seats,
      };
    }
    if (vehicle.condition) {
      car['itemCondition'] =
        vehicle.condition === 'new'
          ? 'https://schema.org/NewCondition'
          : 'https://schema.org/UsedCondition';
    }

    car['offers'] = {
      '@type': 'Offer',
      priceCurrency: 'EGP',
      // No price when it is on request: an invented number would be a lie to
      // both the visitor and the search engine.
      ...(price === null ? {} : { price }),
      availability:
        vehicle.status === 'available'
          ? 'https://schema.org/InStock'
          : 'https://schema.org/LimitedAvailability',
      url: this.absolute(`/vehicles/${vehicle.id}`),
    };

    return car;
  }

  private setCanonical(url: string): void {
    if (!url) {
      return;
    }

    const head = this.document.head;
    let link = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

    if (!link) {
      link = this.document.createElement('link');
      link.rel = 'canonical';
      head.appendChild(link);
    }

    link.href = url;
  }

  private setJsonLd(data: Record<string, unknown>): void {
    this.removeJsonLd();

    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute(JSON_LD_ATTRIBUTE, '');
    script.textContent = JSON.stringify(data);
    this.document.head.appendChild(script);
  }

  private removeJsonLd(): void {
    this.document.head.querySelector(`script[${JSON_LD_ATTRIBUTE}]`)?.remove();
  }
}
