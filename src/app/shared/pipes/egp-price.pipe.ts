import { Pipe, PipeTransform } from '@angular/core';

/**
 * `545000` → `EGP 545,000`.
 *
 * Latin digits and grouping, because prices render in Inter (CLAUDE.md §4).
 * A missing price is not a dash or an empty label — it is the Egyptian Arabic
 * `السعر عند الاتصال`, which is what `priceOnRequest` means to a visitor.
 */
@Pipe({ name: 'egpPrice' })
export class EgpPricePipe implements PipeTransform {
  transform(value: number | null | undefined, fallback = 'السعر عند الاتصال'): string {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return fallback;
    }

    return `EGP ${new Intl.NumberFormat('en-US').format(value)}`;
  }
}
