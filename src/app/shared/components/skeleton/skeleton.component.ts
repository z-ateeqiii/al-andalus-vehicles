import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type SkeletonShape = 'line' | 'block' | 'circle';

/**
 * Loading placeholder with a subtle shimmer over `--color-surface`.
 *
 * Never use a bare spinner for a whole page (CLAUDE.md §5) — compose these
 * into the shape of the content that is coming: a hero, a vehicle card, an
 * admin table row.
 *
 * Mark the surrounding region `aria-busy="true"`; the skeletons themselves
 * are hidden from assistive tech.
 */
@Component({
  selector: 'app-skeleton',
  imports: [],
  templateUrl: './skeleton.component.html',
  styleUrl: './skeleton.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block', 'aria-hidden': 'true' },
})
export class SkeletonComponent {
  readonly shape = input<SkeletonShape>('line');

  /** Any CSS length. */
  readonly width = input('100%');

  /** Any CSS length. Ignored for `circle`, which stays square. */
  readonly height = input('1rem');

  /** Repeat as stacked text lines; the last one is shortened. */
  readonly lines = input(1);

  protected readonly repeats = computed(() => Array.from({ length: Math.max(1, this.lines()) }));

  protected readonly shapeClass = computed(
    () =>
      ({
        line: 'rounded',
        block: 'rounded-card',
        circle: 'aspect-square rounded-full',
      })[this.shape()],
  );

  protected lineWidth(index: number): string {
    const isLastOfMany = this.lines() > 1 && index === this.lines() - 1;
    return isLastOfMany ? '60%' : this.width();
  }
}
