import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SkeletonComponent } from '../skeleton/skeleton.component';

/**
 * Shaped to `vehicle-card`: the same 4:3 image block, colour line, title,
 * year and price, so nothing moves when the real card replaces it.
 */
@Component({
  selector: 'app-vehicle-card-skeleton',
  imports: [SkeletonComponent],
  templateUrl: './vehicle-card-skeleton.component.html',
  styleUrl: './vehicle-card-skeleton.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class VehicleCardSkeletonComponent {}
