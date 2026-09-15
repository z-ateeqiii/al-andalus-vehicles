import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FILLED_ICONS, ICON_PATHS, IconName } from './icon-paths';

/**
 * Renders one inline SVG icon from the hand-written library in `icon-paths.ts`.
 *
 * Icons inherit `currentColor`, so colour them with a text utility on the
 * host or a parent (`class="text-gold"`).
 */
@Component({
  selector: 'app-icon',
  imports: [],
  templateUrl: './icon.component.html',
  styleUrl: './icon.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex shrink-0',
    '[attr.aria-hidden]': 'label() ? null : "true"',
  },
})
export class IconComponent {
  /** Which icon to draw. */
  readonly name = input.required<IconName>();

  /** Edge length in px. Icons are square. */
  readonly size = input(24);

  readonly strokeWidth = input(1.6);

  /**
   * Accessible name. Leave empty for decorative icons — the host is then
   * marked `aria-hidden` and the neighbouring text carries the meaning.
   */
  readonly label = input('');

  protected readonly paths = computed<readonly string[]>(() => ICON_PATHS[this.name()]);

  protected readonly filled = computed(() => FILLED_ICONS.has(this.name()));
}
