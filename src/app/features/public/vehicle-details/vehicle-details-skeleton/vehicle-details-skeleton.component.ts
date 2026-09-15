import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';

/**
 * Shaped to the real details page: gallery plus thumbnail strip on the start
 * side, title, spec grid and buttons on the end side, then the tile strip.
 */
@Component({
  selector: 'app-vehicle-details-skeleton',
  imports: [SkeletonComponent],
  templateUrl: './vehicle-details-skeleton.component.html',
  styleUrl: './vehicle-details-skeleton.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'aria-busy': 'true' },
})
export class VehicleDetailsSkeletonComponent {
  protected readonly thumbs = [0, 1, 2, 3];
  protected readonly cells = [0, 1, 2, 3, 4, 5];
}
