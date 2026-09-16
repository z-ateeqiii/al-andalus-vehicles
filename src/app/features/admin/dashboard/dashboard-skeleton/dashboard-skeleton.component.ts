import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';

/** Shaped to the real dashboard: button, four stat cards, split bar, list. */
@Component({
  selector: 'app-dashboard-skeleton',
  imports: [SkeletonComponent],
  templateUrl: './dashboard-skeleton.component.html',
  styleUrl: './dashboard-skeleton.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'aria-busy': 'true' },
})
export class DashboardSkeletonComponent {
  protected readonly cards = [0, 1, 2, 3];
  protected readonly rows = [0, 1, 2, 3, 4];
}
