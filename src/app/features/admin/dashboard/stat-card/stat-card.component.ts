import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { IconName } from '../../../../shared/components/icon/icon-paths';

/** One of the four numbers across the top of the dashboard. */
@Component({
  selector: 'app-stat-card',
  imports: [IconComponent],
  templateUrl: './stat-card.component.html',
  styleUrl: './stat-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number | null>();
  readonly icon = input.required<IconName>();

  /** Plain-language explanation for the owner, shown on hover and to readers. */
  readonly hint = input('');
}
