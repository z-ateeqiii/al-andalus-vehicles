import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  VEHICLE_CATEGORY_LABELS,
  VEHICLE_CATEGORY_ORDER,
  VEHICLE_STATUS_LABELS,
  Vehicle,
  VehicleCategory,
  VehicleStatus,
} from '../../../core/models/vehicle.model';
import { ToastService } from '../../../core/services/toast.service';
import { VehicleService } from '../../../core/services/vehicle.service';
import { CloudImageComponent } from '../../../shared/components/cloud-image/cloud-image.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { EgpPricePipe } from '../../../shared/pipes/egp-price.pipe';

const STATUS_ORDER: readonly VehicleStatus[] = ['available', 'reserved', 'sold', 'hidden'];

/**
 * Storyboard panel 04's العربيات screen.
 *
 * The status `<select>` and the مميزة star save straight from the row —
 * marking a vehicle مباعة and choosing what the home page features are the
 * things the owner changes most, and making them open a form for either would
 * be the wrong shape. Deleting, which cannot be undone,
 * always goes through a dialog that names the vehicle.
 */
@Component({
  selector: 'app-admin-vehicles',
  imports: [
    RouterLink,
    CloudImageComponent,
    ConfirmDialogComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    IconComponent,
    SkeletonComponent,
    EgpPricePipe,
  ],
  templateUrl: './vehicles.component.html',
  styleUrl: './vehicles.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminVehiclesComponent {
  private readonly vehicleService = inject(VehicleService);
  private readonly toast = inject(ToastService);

  protected readonly all = signal<readonly Vehicle[] | null>(null);
  protected readonly failed = signal(false);

  protected readonly search = signal('');
  protected readonly category = signal<VehicleCategory | 'all'>('all');
  protected readonly status = signal<VehicleStatus | 'all'>('all');

  /** Ids currently mid-save, so their row select can disable itself. */
  protected readonly saving = signal<ReadonlySet<string>>(new Set());

  protected readonly pendingDelete = signal<Vehicle | null>(null);
  protected readonly deleting = signal(false);

  protected readonly categoryLabels = VEHICLE_CATEGORY_LABELS;
  protected readonly statusLabels = VEHICLE_STATUS_LABELS;
  protected readonly statusOptions = STATUS_ORDER;
  protected readonly categoryOptions = VEHICLE_CATEGORY_ORDER;
  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  protected readonly filtered = computed(() => {
    const list = this.all();
    if (list === null) {
      return null;
    }

    const needle = this.search().trim().toLowerCase();
    const category = this.category();
    const status = this.status();

    return list.filter((vehicle) => {
      if (category !== 'all' && vehicle.category !== category) {
        return false;
      }
      if (status !== 'all' && vehicle.status !== status) {
        return false;
      }
      if (needle) {
        const haystack = `${vehicle.brand} ${vehicle.model} ${vehicle.year}`.toLowerCase();
        if (!haystack.includes(needle)) {
          return false;
        }
      }
      return true;
    });
  });

  protected readonly hasFilters = computed(
    () => this.search().trim() !== '' || this.category() !== 'all' || this.status() !== 'all',
  );

  protected readonly deleteMessage = computed(() => {
    const vehicle = this.pendingDelete();
    return vehicle
      ? `هتمسح «${this.titleOf(vehicle)}» نهائيًا من المعرض. مش هينفع تسترجعها بعد كده.`
      : '';
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.failed.set(false);
    this.all.set(null);

    this.vehicleService.listAll().then(
      (list) => this.all.set(list),
      () => this.failed.set(true),
    );
  }

  protected titleOf(vehicle: Vehicle): string {
    return `${vehicle.brand} ${vehicle.model} ${vehicle.year}`.trim();
  }

  protected isSaving(id: string): boolean {
    return this.saving().has(id);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.category.set('all');
    this.status.set('all');
  }

  /** Saves immediately from the row, and puts the old value back if it fails. */
  protected async changeStatus(vehicle: Vehicle, raw: string): Promise<void> {
    const next = raw as VehicleStatus;
    if (next === vehicle.status) {
      return;
    }

    this.markSaving(vehicle.id, true);
    // Optimistic: the select already shows the new value, so the list should
    // agree with it while the write is in flight.
    this.patchLocal(vehicle.id, { status: next });

    try {
      await this.vehicleService.updateStatus(vehicle.id, next);
      this.toast.success(`تم تغيير حالة «${this.titleOf(vehicle)}» لـ ${this.statusLabels[next]}`);
    } catch {
      this.patchLocal(vehicle.id, { status: vehicle.status });
      this.toast.error('حصلت مشكلة، حاول تاني');
    } finally {
      this.markSaving(vehicle.id, false);
    }
  }

  /** Same shape as `changeStatus`: optimistic, rolled back on failure. */
  protected async toggleFeatured(vehicle: Vehicle): Promise<void> {
    if (this.isSaving(vehicle.id)) {
      return;
    }

    const next = !vehicle.isFeatured;
    this.markSaving(vehicle.id, true);
    this.patchLocal(vehicle.id, { isFeatured: next });

    try {
      await this.vehicleService.setFeatured(vehicle.id, next);
      this.toast.success(
        next
          ? `«${this.titleOf(vehicle)}» هتظهر في أبرز العربيات`
          : `«${this.titleOf(vehicle)}» مش هتظهر في أبرز العربيات`,
      );
    } catch {
      this.patchLocal(vehicle.id, { isFeatured: vehicle.isFeatured });
      this.toast.error('حصلت مشكلة، حاول تاني');
    } finally {
      this.markSaving(vehicle.id, false);
    }
  }

  protected askDelete(vehicle: Vehicle): void {
    this.pendingDelete.set(vehicle);
  }

  protected cancelDelete(): void {
    if (!this.deleting()) {
      this.pendingDelete.set(null);
    }
  }

  protected async confirmDelete(): Promise<void> {
    const vehicle = this.pendingDelete();
    if (!vehicle || this.deleting()) {
      return;
    }

    this.deleting.set(true);

    try {
      await this.vehicleService.remove(vehicle.id);
      this.all.update((list) => (list ?? []).filter((item) => item.id !== vehicle.id));
      this.toast.success(`تم مسح «${this.titleOf(vehicle)}»`);
      this.pendingDelete.set(null);
    } catch {
      this.toast.error('حصلت مشكلة، حاول تاني');
    } finally {
      this.deleting.set(false);
    }
  }

  private patchLocal(id: string, patch: Partial<Pick<Vehicle, 'status' | 'isFeatured'>>): void {
    this.all.update(
      (list) => list?.map((item) => (item.id === id ? { ...item, ...patch } : item)) ?? null,
    );
  }

  private markSaving(id: string, active: boolean): void {
    this.saving.update((current) => {
      const next = new Set(current);
      if (active) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }
}
