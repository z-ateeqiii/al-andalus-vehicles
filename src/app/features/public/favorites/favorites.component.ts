import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Vehicle } from '../../../core/models/vehicle.model';
import { FavoritesService } from '../../../core/services/favorites.service';
import { VehicleService } from '../../../core/services/vehicle.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { VehicleGridComponent } from '../../../shared/components/vehicle-grid/vehicle-grid.component';

/**
 * Saved vehicles. `localStorage` only — there are no customer accounts
 * (CLAUDE.md §1), so this route is client-rendered.
 *
 * A vehicle that has since sold or been hidden simply drops out, because the
 * saved ids are resolved against the public list.
 */
@Component({
  selector: 'app-favorites',
  imports: [VehicleGridComponent, EmptyStateComponent, ErrorStateComponent],
  templateUrl: './favorites.component.html',
  styleUrl: './favorites.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FavoritesComponent {
  private readonly vehicleService = inject(VehicleService);
  private readonly favorites = inject(FavoritesService);

  protected readonly all = signal<readonly Vehicle[] | null>(null);
  protected readonly failed = signal(false);

  protected readonly saved = computed(() => {
    const list = this.all();
    return list === null ? null : this.favorites.pick(list);
  });

  protected readonly count = computed(() => this.saved()?.length ?? null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.failed.set(false);
    this.all.set(null);

    this.vehicleService.listPublic().then(
      (list) => this.all.set(list),
      () => this.failed.set(true),
    );
  }

  protected clear(): void {
    this.favorites.clear();
  }
}
