import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  VEHICLE_CATEGORY_LABELS,
  VEHICLE_CATEGORY_ORDER,
  VehicleCategory,
} from '../../../../core/models/vehicle.model';

interface Segment {
  readonly key: VehicleCategory;
  readonly label: string;
  readonly count: number;
  readonly percent: number;
  /** Tailwind background class; the palette has no third accent, so this
      steps down through the warm neutrals rather than inventing a colour. */
  readonly swatch: string;
}

const SWATCHES: Record<VehicleCategory, string> = {
  pickup: 'bg-gold',
  minibus: 'bg-gold/45',
  passenger: 'bg-cream/45',
};

/**
 * The ربع نقل / ميكروباص / ملاكي split, as a plain CSS bar.
 *
 * Deliberately not a chart library — CLAUDE.md §2 rules those out, and three
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
  readonly counts = input.required<Record<VehicleCategory, number>>();

  protected readonly total = computed(() =>
    VEHICLE_CATEGORY_ORDER.reduce((sum, key) => sum + this.counts()[key], 0),
  );

  /**
   * Percentages are rounded down and the largest segment absorbs the
   * remainder, so the three always add up to exactly 100.
   */
  protected readonly segments = computed<readonly Segment[]>(() => {
    const total = this.total();
    if (total === 0) {
      return [];
    }

    const counts = this.counts();
    const raw = VEHICLE_CATEGORY_ORDER.map((key) => ({
      key,
      label: VEHICLE_CATEGORY_LABELS[key],
      count: counts[key],
      percent: Math.floor((counts[key] / total) * 100),
      swatch: SWATCHES[key],
    }));

    const shortfall = 100 - raw.reduce((sum, item) => sum + item.percent, 0);
    if (shortfall > 0) {
      const largest = raw.reduce((best, item) => (item.count > best.count ? item : best), raw[0]);
      largest.percent += shortfall;
    }

    return raw;
  });

  protected readonly summary = computed(() =>
    this.segments()
      .map((segment) => `${segment.label} ${segment.percent} بالمية`)
      .join('، '),
  );
}
