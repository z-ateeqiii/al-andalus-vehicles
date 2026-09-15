import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type LogoSize = 'sm' | 'md' | 'lg';

/**
 * The معرض الأندلس mark: a gold swoosh over the Arabic wordmark.
 * Storyboard panel 06.
 */
@Component({
  selector: 'app-logo',
  imports: [],
  templateUrl: './logo.component.html',
  styleUrl: './logo.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-block text-gold' },
})
export class LogoComponent {
  readonly size = input<LogoSize>('md');

  /** Shows the `نُقتك .. طريقنا` strapline under the wordmark. */
  readonly tagline = input(false);

  protected readonly swooshWidth = computed(() => ({ sm: 44, md: 58, lg: 92 })[this.size()]);

  protected readonly wordmarkClass = computed(
    () => ({ sm: 'text-lg', md: 'text-2xl', lg: 'text-4xl' })[this.size()],
  );
}
