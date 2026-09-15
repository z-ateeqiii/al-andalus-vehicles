import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShowroomSettings } from '../../../core/models/showroom-settings.model';
import { Vehicle } from '../../../core/models/vehicle.model';
import { CloudinaryService } from '../../../core/services/cloudinary.service';
import { SettingsService } from '../../../core/services/settings.service';
import { VehicleService } from '../../../core/services/vehicle.service';
import { WhatsAppService } from '../../../core/services/whatsapp.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { CloudImageComponent } from '../../../shared/components/cloud-image/cloud-image.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { IconName } from '../../../shared/components/icon/icon-paths';
import { VehicleGridComponent } from '../../../shared/components/vehicle-grid/vehicle-grid.component';
import { HomeSkeletonComponent } from './home-skeleton/home-skeleton.component';

interface TrustItem {
  readonly icon: IconName;
  readonly label: string;
}

/** Storyboard panel 01. */
@Component({
  selector: 'app-home',
  imports: [
    RouterLink,
    CloudImageComponent,
    IconComponent,
    VehicleGridComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    HomeSkeletonComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly vehicleService = inject(VehicleService);
  private readonly settingsService = inject(SettingsService);
  private readonly cloudinary = inject(CloudinaryService);
  private readonly whatsapp = inject(WhatsAppService);
  private readonly document = inject(DOCUMENT);

  protected readonly settings = signal<ShowroomSettings | null>(null);
  protected readonly vehicles = signal<readonly Vehicle[] | null>(null);
  protected readonly failed = signal(false);

  /** `null` while loading, so the grid shows its own skeletons. */
  protected readonly featured = computed(() => {
    const list = this.vehicles();
    return list === null ? null : this.vehicleService.featured(list, 6);
  });

  protected readonly trustItems: readonly TrustItem[] = [
    { icon: 'shield', label: 'جميع السيارات مضمونة' },
    { icon: 'coins', label: 'أسعار مناسبة' },
    { icon: 'clock', label: 'إجراءات سهلة وسريعة' },
  ];

  constructor() {
    void this.settingsService.load().then((settings) => {
      this.settings.set(settings);
      this.preloadHero(settings.heroImageUrl);
    });

    this.loadVehicles();
  }

  protected loadVehicles(): void {
    this.failed.set(false);
    this.vehicles.set(null);

    this.vehicleService.listPublic().then(
      (list) => this.vehicles.set(list),
      () => this.failed.set(true),
    );
  }

  protected contactOnWhatsApp(): void {
    this.whatsapp.openGeneral();
  }

  /**
   * The hero is the LCP element, so the browser should start fetching it from
   * the HTML rather than after the component renders. The URL only exists at
   * runtime — it comes from Firestore — so the tag is added here.
   */
  private preloadHero(url: string): void {
    if (!url) {
      return;
    }

    const head = this.document.head;

    // A marker attribute rather than a href selector: CSS.escape is a browser
    // global and does not exist in the SSR DOM.
    if (head.querySelector('link[data-hero-preload]')) {
      return;
    }

    const link = this.document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.setAttribute('fetchpriority', 'high');
    link.setAttribute('data-hero-preload', '');
    link.href = this.cloudinary.transform(url, 1600);
    head.appendChild(link);
  }
}
