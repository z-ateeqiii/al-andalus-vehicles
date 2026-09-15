import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Vehicle } from '../../../core/models/vehicle.model';
import { VehicleCardSkeletonComponent } from '../vehicle-card-skeleton/vehicle-card-skeleton.component';
import { VehicleCardComponent } from '../vehicle-card/vehicle-card.component';

/**
 * The standard catalogue grid — 1 column on mobile, 2 at tablet, 3 at 1024,
 * 4 at 1280, 5 on a wide desktop (build spec §6.3).
 *
 * Passing `null` renders skeleton cards in the same grid, so the loading
 * state is the real layout rather than an approximation of it.
 */
@Component({
  selector: 'app-vehicle-grid',
  imports: [VehicleCardComponent, VehicleCardSkeletonComponent],
  templateUrl: './vehicle-grid.component.html',
  styleUrl: './vehicle-grid.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class VehicleGridComponent {
  /** `null` means "still loading". */
  readonly vehicles = input<readonly Vehicle[] | null>(null);

  readonly skeletonCount = input(10);

  protected readonly placeholders = computed(() => Array.from({ length: this.skeletonCount() }));
}
