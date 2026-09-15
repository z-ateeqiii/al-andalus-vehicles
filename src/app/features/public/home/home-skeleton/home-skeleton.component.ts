import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { VehicleGridComponent } from '../../../../shared/components/vehicle-grid/vehicle-grid.component';

/**
 * Shaped to the real home page: a full-viewport hero block with the headline,
 * subheading, description, two buttons and the trust row, then the أبرز
 * العربيات grid.
 */
@Component({
  selector: 'app-home-skeleton',
  imports: [SkeletonComponent, VehicleGridComponent],
  templateUrl: './home-skeleton.component.html',
  styleUrl: './home-skeleton.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'aria-busy': 'true' },
})
export class HomeSkeletonComponent {
  protected readonly trustPlaceholders = [0, 1, 2];
}
