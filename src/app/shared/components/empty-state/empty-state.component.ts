import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../icon/icon.component';
import { IconName } from '../icon/icon-paths';

/**
 * Friendly "there is nothing here" panel.
 * Copy is Egyptian Arabic — `مفيش عربيات متاحة دلوقتي`.
 */
@Component({
  selector: 'app-empty-state',
  imports: [IconComponent, RouterLink],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class EmptyStateComponent {
  readonly icon = input<IconName>('inbox');

  readonly title = input.required<string>();

  readonly message = input('');

  readonly actionLabel = input('');

  /** When set, the action renders as a link instead of a button. */
  readonly actionLink = input<string | null>(null);

  readonly action = output<void>();
}
