import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VEHICLE_STATUS_LABELS, Vehicle } from '../../../core/models/vehicle.model';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { VehicleService } from '../../../core/services/vehicle.service';
import { CloudImageComponent } from '../../../shared/components/cloud-image/cloud-image.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EgpPricePipe } from '../../../shared/pipes/egp-price.pipe';
import { CategorySplitComponent } from './category-split/category-split.component';
import { DashboardSkeletonComponent } from './dashboard-skeleton/dashboard-skeleton.component';
import { StatCardComponent } from './stat-card/stat-card.component';

const RECENT_COUNT = 5;

/**
 * Storyboard panel 04, minus everything illustrative.
 *
 * Four counts, the category split, the five most recent vehicles and one
 * obvious way to add another. No sales chart, no revenue, no donut — those
 * are explicitly out of scope (CLAUDE.md §1).
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    StatCardComponent,
    CategorySplitComponent,
    DashboardSkeletonComponent,
    CloudImageComponent,
    IconComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    EgpPricePipe,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly vehicleService = inject(VehicleService);
  private readonly analytics = inject(AnalyticsService);

  protected readonly vehicles = signal<readonly Vehicle[] | null>(null);
  protected readonly visitors = signal<number | null>(null);
  protected readonly failed = signal(false);

  protected readonly statusLabels = VEHICLE_STATUS_LABELS;

  private readonly byStatus = computed(() => {
    const list = this.vehicles();
    return list ? this.vehicleService.countByStatus(list) : null;
  });

  private readonly byCategory = computed(() => {
    const list = this.vehicles();
    return list ? this.vehicleService.countByCategory(list) : null;
  });

  protected readonly totalCount = computed(() => this.vehicles()?.length ?? null);
  protected readonly availableCount = computed(() => this.byStatus()?.available ?? null);

  /** Sold and reserved together, as one number the owner reads as "gone". */
  protected readonly soldOrReservedCount = computed(() => {
    const counts = this.byStatus();
    return counts ? counts.sold + counts.reserved : null;
  });

  protected readonly categoryCounts = computed(
    () => this.byCategory() ?? { pickup: 0, minibus: 0, passenger: 0 },
  );

  /** `listAll` is already ordered newest first. */
  protected readonly recent = computed(() => this.vehicles()?.slice(0, RECENT_COUNT) ?? []);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.failed.set(false);
    this.vehicles.set(null);

    this.vehicleService.listAll().then(
      (list) => this.vehicles.set(list),
      () => this.failed.set(true),
    );

    // The counter is a separate document and a separate failure: a blocked
    // read there must not take the whole dashboard down.
    void this.analytics.totalViews().then((views) => this.visitors.set(views));
  }

  protected titleOf(vehicle: Vehicle): string {
    return `${vehicle.brand} ${vehicle.model} ${vehicle.year}`.trim();
  }

  protected statusClass(vehicle: Vehicle): string {
    switch (vehicle.status) {
      case 'available':
        return 'border-success/40 bg-success/10 text-success';
      case 'reserved':
        return 'border-warning/40 bg-warning/10 text-warning';
      case 'sold':
        return 'border-danger/40 bg-danger/10 text-danger';
      default:
        return 'border-elevated/60 bg-elevated/40 text-muted';
    }
  }
}
