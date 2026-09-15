import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { VehicleCategory } from '../../../../core/models/vehicle.model';

export interface PriceOption {
  /** `min-max`, the value that goes in the query string. */
  readonly value: string;
  readonly label: string;
}

export interface FilterSelection {
  readonly category: VehicleCategory | 'all';
  readonly brand: string;
  readonly price: string;
}

/**
 * The نوع العربية / الماركة / السعر panel. Storyboard panel 02.
 *
 * Selections are staged locally and only leave on `تطبيق الفلتر`, which is
 * what the gold button in the mockup implies. The chips above the grid change
 * category immediately — those are a different control.
 */
@Component({
  selector: 'app-vehicle-filters',
  imports: [],
  templateUrl: './vehicle-filters.component.html',
  styleUrl: './vehicle-filters.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class VehicleFiltersComponent {
  /** Derived from the real documents, never a hardcoded list. */
  readonly brands = input.required<readonly string[]>();
  readonly priceOptions = input.required<readonly PriceOption[]>();
  readonly showPassengerVehicles = input(true);

  /** The filters currently in the URL. */
  readonly selection = input.required<FilterSelection>();

  readonly apply = output<FilterSelection>();

  protected readonly draftCategory = signal<VehicleCategory | 'all'>('all');
  protected readonly draftBrand = signal('');
  protected readonly draftPrice = signal('');

  protected readonly hasAnything = computed(
    () => this.draftCategory() !== 'all' || this.draftBrand() !== '' || this.draftPrice() !== '',
  );

  constructor() {
    // Re-sync whenever the URL changes underneath the panel.
    effect(() => {
      const current = this.selection();
      this.draftCategory.set(current.category);
      this.draftBrand.set(current.brand);
      this.draftPrice.set(current.price);
    });
  }

  protected onCategory(value: string): void {
    this.draftCategory.set(value === 'pickup' || value === 'passenger' ? value : 'all');
  }

  protected submit(): void {
    this.apply.emit({
      category: this.draftCategory(),
      brand: this.draftBrand(),
      price: this.draftPrice(),
    });
  }

  protected reset(): void {
    this.apply.emit({ category: 'all', brand: '', price: '' });
  }
}
