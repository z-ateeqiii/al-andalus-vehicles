import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * The نص نقل / ملاكي split, as a plain CSS bar.
 *
 * Deliberately not a chart library — CLAUDE.md §2 rules those out, and two
 * numbers do not need one. The storyboard's donut is illustrative.
 */
@Component({
  selector: 'app-category-split',
  imports: [],
  templateUrl: './category-split.component.html',
  styleUrl: './category-split.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class CategorySplitComponent {
  readonly pickupCount = input.required<number>();
  readonly passengerCount = input.required<number>();

  protected readonly total = computed(() => this.pickupCount() + this.passengerCount());

  protected readonly pickupPercent = computed(() =>
    this.total() === 0 ? 0 : Math.round((this.pickupCount() / this.total()) * 100),
  );

  /** Taken from 100 so the two always add up, whatever the rounding does. */
  protected readonly passengerPercent = computed(() =>
    this.total() === 0 ? 0 : 100 - this.pickupPercent(),
  );
}
