import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Vehicle } from '../../../core/models/vehicle.model';
import { VehicleCardSkeletonComponent } from '../vehicle-card-skeleton/vehicle-card-skeleton.component';
import { VehicleCardComponent } from '../vehicle-card/vehicle-card.component';

/**
 * The standard catalogue grid — 1 column on mobile, 2 at tablet, 3 at 1024,
 * 4 at 1280, 5 on a wide desktop (build spec §6.3). A section with fewer cards
 * than that keeps the same card size and is centred (see the stylesheet).
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

  /**
   * How many leading cards sit above the fold and should load eagerly. The
   * very first of them also gets `fetchpriority="high"` as the page's LCP
   * candidate; the rest are merely eager.
   *
   * Leave at 0 for a grid that is below the fold — the home page's featured
   * band sits under a full-viewport hero, so its cards stay lazy.
   *
   * The real first row is breakpoint-dependent (1 card at 375px, 5 at 1536px)
   * and markup cannot know which applies, so this is a deliberate compromise:
   * enough cards to cover a desktop row, with only one high-priority hint so
   * a phone does not fetch four full-width images that compete with each
   * other.
   */
  readonly eagerCount = input(0);

  protected readonly placeholders = computed(() => Array.from({ length: this.skeletonCount() }));
}
