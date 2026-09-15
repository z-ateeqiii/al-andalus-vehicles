import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { VEHICLE_CATEGORY_LABELS, Vehicle } from '../../../core/models/vehicle.model';
import { FavoritesService } from '../../../core/services/favorites.service';
import { SeoService } from '../../../core/services/seo.service';
import { SettingsService } from '../../../core/services/settings.service';
import { VehicleService } from '../../../core/services/vehicle.service';
import { WhatsAppService } from '../../../core/services/whatsapp.service';
import { CloudImageComponent } from '../../../shared/components/cloud-image/cloud-image.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { IconName } from '../../../shared/components/icon/icon-paths';
import { EgpPricePipe } from '../../../shared/pipes/egp-price.pipe';
import { VehicleDetailsSkeletonComponent } from './vehicle-details-skeleton/vehicle-details-skeleton.component';
import { VehicleGalleryComponent } from './vehicle-gallery/vehicle-gallery.component';

interface SpecCell {
  readonly icon: IconName;
  readonly label: string;
  readonly value: string;
  readonly emphasised?: boolean;
}

interface SpecTile {
  readonly icon: IconName;
  readonly label: string;
  readonly value: string;
}

/** Picks an icon for a free-text feature, falling back to a tick. */
function iconForFeature(feature: string): IconName {
  if (feature.includes('تكييف')) return 'snowflake';
  if (feature.includes('وساد')) return 'airbag';
  if (feature.includes('فرامل') || feature.includes('ABS')) return 'brake';
  if (feature.includes('شاشة')) return 'image';
  if (feature.includes('كامير')) return 'eye';
  if (feature.includes('سقف')) return 'car';
  return 'check';
}

/** Storyboard panel 03. */
@Component({
  selector: 'app-vehicle-details',
  imports: [
    RouterLink,
    VehicleGalleryComponent,
    VehicleDetailsSkeletonComponent,
    CloudImageComponent,
    IconComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    EgpPricePipe,
  ],
  templateUrl: './vehicle-details.component.html',
  styleUrl: './vehicle-details.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehicleDetailsComponent {
  private readonly vehicleService = inject(VehicleService);
  private readonly whatsapp = inject(WhatsAppService);
  private readonly favorites = inject(FavoritesService);
  private readonly settingsService = inject(SettingsService);
  private readonly seo = inject(SeoService);

  /** Bound from the route by `withComponentInputBinding`. */
  readonly id = input.required<string>();

  protected readonly vehicle = signal<Vehicle | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);

  protected readonly title = computed(() => {
    const vehicle = this.vehicle();
    return vehicle ? `${vehicle.brand} ${vehicle.model} ${vehicle.year}`.trim() : '';
  });

  protected readonly images = computed(() => {
    const vehicle = this.vehicle();
    if (!vehicle) {
      return [];
    }
    // The cover leads, and is not repeated if it is also in the gallery.
    const rest = vehicle.imageUrls.filter((url) => url !== vehicle.coverImageUrl);
    return vehicle.coverImageUrl ? [vehicle.coverImageUrl, ...rest] : rest;
  });

  /** Photos beyond the ones already in the gallery strip. */
  protected readonly extraImages = computed(() => this.images().slice(1));

  protected readonly isSaved = computed(() => {
    const vehicle = this.vehicle();
    return vehicle ? this.favorites.has(vehicle.id) : false;
  });

  /**
   * The three-column grid. Every field without a value is dropped entirely —
   * no empty labels, no dashes — so this reflows cleanly at 2, 4 or 6 cells.
   */
  protected readonly specs = computed<readonly SpecCell[]>(() => {
    const vehicle = this.vehicle();
    if (!vehicle) {
      return [];
    }

    const cells: SpecCell[] = [];

    if (vehicle.year) {
      cells.push({ icon: 'calendar', label: 'الموديل', value: String(vehicle.year) });
    }
    if (typeof vehicle.mileage === 'number') {
      cells.push({
        icon: 'gauge',
        label: 'العداد',
        value: `${new Intl.NumberFormat('en-US').format(vehicle.mileage)} كم`,
      });
    }
    if (vehicle.category) {
      cells.push({
        icon: 'car',
        label: 'الفئة',
        value: VEHICLE_CATEGORY_LABELS[vehicle.category],
      });
    }
    if (vehicle.transmission) {
      cells.push({ icon: 'gearbox', label: 'الفتيس', value: vehicle.transmission });
    }
    if (vehicle.payload) {
      cells.push({ icon: 'weight', label: 'الحمولة', value: vehicle.payload });
    }

    cells.push({
      icon: 'tag',
      label: 'السعر',
      value: new EgpPricePipe().transform(vehicle.price),
      emphasised: true,
    });

    return cells;
  });

  /** Up to six tiles, built from whatever the vehicle actually has. */
  protected readonly tiles = computed<readonly SpecTile[]>(() => {
    const vehicle = this.vehicle();
    if (!vehicle) {
      return [];
    }

    const tiles: SpecTile[] = [];

    if (vehicle.engine) {
      tiles.push({ icon: 'engine', label: 'محرك', value: vehicle.engine });
    }
    if (vehicle.power) {
      tiles.push({ icon: 'bolt', label: 'القوة', value: vehicle.power });
    }
    if (vehicle.transmission) {
      tiles.push({ icon: 'gearbox', label: 'ناقل الحركة', value: vehicle.transmission });
    }

    // The spec names محرك / القوة / ناقل الحركة then three feature-driven
    // tiles, so features take the next slots and fuel/bed type only fill
    // what is left over.
    for (const feature of vehicle.features ?? []) {
      if (tiles.length >= 6) {
        break;
      }
      tiles.push({ icon: iconForFeature(feature), label: feature, value: '' });
    }

    if (vehicle.fuelType) {
      tiles.push({ icon: 'fuel', label: 'نوع الوقود', value: vehicle.fuelType });
    }
    if (vehicle.bedType) {
      tiles.push({ icon: 'car', label: 'نوع الصندوق', value: vehicle.bedType });
    }

    return tiles.slice(0, 6);
  });

  constructor() {
    effect(() => {
      const id = this.id();
      this.load(id);
    });
  }

  protected reload(): void {
    this.load(this.id());
  }

  protected contactOnWhatsApp(): void {
    const vehicle = this.vehicle();
    if (vehicle) {
      this.whatsapp.openForVehicle(vehicle);
    }
  }

  protected toggleFavorite(): void {
    const vehicle = this.vehicle();
    if (vehicle) {
      this.favorites.toggle(vehicle.id);
    }
  }

  private load(id: string): void {
    this.loading.set(true);
    this.failed.set(false);

    // Settings and the vehicle are awaited together: the preview description
    // names the showroom, and both reads are already in TransferState.
    void Promise.all([this.vehicleService.getPublic(id), this.settingsService.load()]).then(
      ([vehicle, settings]) => {
        this.vehicle.set(vehicle);
        this.loading.set(false);

        if (vehicle) {
          this.seo.applyVehicle(vehicle, settings);
        } else {
          this.seo.applyPage({
            title: 'العربية دي مش موجودة',
            description: 'العربية اللي بتدور عليها مش متاحة دلوقتي في معرض الأندلس.',
            path: `/vehicles/${id}`,
          });
        }
      },
      () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    );
  }
}
