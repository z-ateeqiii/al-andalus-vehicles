import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { ShowroomSettings } from '../../../core/models/showroom-settings.model';
import {
  OPTIONAL_VEHICLE_CATEGORIES,
  VEHICLE_CATEGORY_EMPTY_MESSAGES,
  VEHICLE_CATEGORY_LABELS,
  VEHICLE_CATEGORY_ORDER,
  VEHICLE_CATEGORY_SECTION_TITLES,
  Vehicle,
  VehicleCategory,
} from '../../../core/models/vehicle.model';
import { SeoService } from '../../../core/services/seo.service';
import { SettingsService } from '../../../core/services/settings.service';
import { VehicleService } from '../../../core/services/vehicle.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { VehicleGridComponent } from '../../../shared/components/vehicle-grid/vehicle-grid.component';
import {
  FilterSelection,
  PriceOption,
  VehicleFiltersComponent,
} from './vehicle-filters/vehicle-filters.component';

type CategoryFilter = VehicleCategory | 'all';

interface Chip {
  readonly value: CategoryFilter;
  readonly label: string;
}

interface Section {
  readonly key: VehicleCategory;
  readonly title: string;
  readonly emptyMessage: string;
  readonly vehicles: readonly Vehicle[] | null;
}

const PRICE_BUCKETS = 4;
const BUCKET_ROUNDING = 50_000;

function formatEgp(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

/** Storyboard panel 02. */
@Component({
  selector: 'app-vehicles',
  imports: [
    VehicleGridComponent,
    VehicleFiltersComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    IconComponent,
  ],
  templateUrl: './vehicles.component.html',
  styleUrl: './vehicles.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehiclesComponent {
  private readonly vehicleService = inject(VehicleService);
  private readonly settingsService = inject(SettingsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);

  protected readonly all = signal<readonly Vehicle[] | null>(null);
  protected readonly settings = signal<ShowroomSettings | null>(null);
  protected readonly failed = signal(false);
  protected readonly sheetOpen = signal(false);

  /**
   * Filter state lives in the query string, so a filtered view is shareable
   * and survives SSR (build spec §6.3).
   */
  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly category = computed<CategoryFilter>(() => {
    const value = this.params().get('category');
    return VEHICLE_CATEGORY_ORDER.includes(value as VehicleCategory)
      ? (value as VehicleCategory)
      : 'all';
  });

  protected readonly brand = computed(() => this.params().get('brand') ?? '');
  protected readonly priceKey = computed(() => this.params().get('price') ?? '');
  protected readonly query = computed(() => (this.params().get('q') ?? '').trim());

  protected readonly selection = computed<FilterSelection>(() => ({
    category: this.category(),
    brand: this.brand(),
    price: this.priceKey(),
  }));

  protected readonly showPassenger = computed(() => this.settings()?.showPassengerVehicles ?? true);

  /** Which categories a visitor may see right now, in display order. */
  protected readonly visibleCategories = computed<readonly VehicleCategory[]>(() =>
    VEHICLE_CATEGORY_ORDER.filter(
      (category) => !OPTIONAL_VEHICLE_CATEGORIES.includes(category) || this.showPassenger(),
    ),
  );

  protected readonly chips = computed<readonly Chip[]>(() => [
    { value: 'all', label: 'الكل' },
    ...this.visibleCategories().map((category) => ({
      value: category,
      label: VEHICLE_CATEGORY_LABELS[category],
    })),
  ]);

  /** Brand options come from the documents themselves. */
  protected readonly brands = computed(() => {
    const list = this.visible();
    return list ? this.vehicleService.distinctBrands(list) : [];
  });

  /** Price bands are derived from the real minimum and maximum, not invented. */
  protected readonly priceOptions = computed<readonly PriceOption[]>(() => {
    const list = this.visible();
    if (!list) {
      return [];
    }

    const range = this.vehicleService.priceRange(list);
    if (!range || range[0] === range[1]) {
      return [];
    }

    const [min, max] = range;
    const rawStep = (max - min) / PRICE_BUCKETS;
    const step = Math.max(BUCKET_ROUNDING, Math.ceil(rawStep / BUCKET_ROUNDING) * BUCKET_ROUNDING);

    const options: PriceOption[] = [];
    for (let start = Math.floor(min / step) * step; start < max; start += step) {
      const end = start + step;
      options.push({
        value: `${start}-${end}`,
        label: `${formatEgp(start)} - ${formatEgp(end)}`,
      });
    }
    return options;
  });

  /** Everything public, minus any category the owner has switched off. */
  private readonly visible = computed(() => {
    const list = this.all();
    if (list === null) {
      return null;
    }

    const allowed = this.visibleCategories();
    return list.filter((vehicle) => allowed.includes(vehicle.category));
  });

  private readonly filtered = computed(() => {
    const list = this.visible();
    if (list === null) {
      return null;
    }

    const brand = this.brand();
    const band = this.parsePriceKey(this.priceKey());
    const needle = this.query().toLowerCase();

    return list.filter((vehicle) => {
      if (brand && vehicle.brand !== brand) {
        return false;
      }

      if (band) {
        if (
          typeof vehicle.price !== 'number' ||
          vehicle.price < band[0] ||
          vehicle.price > band[1]
        ) {
          return false;
        }
      }

      if (needle) {
        const haystack = `${vehicle.brand} ${vehicle.model} ${vehicle.year}`.toLowerCase();
        if (!haystack.includes(needle)) {
          return false;
        }
      }

      return true;
    });
  });

  /**
   * One labelled section per visible category when `الكل` is selected, and
   * just the chosen one otherwise — as the storyboard shows, now with three.
   */
  protected readonly sections = computed<readonly Section[]>(() => {
    const list = this.filtered();
    const selected = this.category();

    return this.visibleCategories()
      .filter((category) => selected === 'all' || selected === category)
      .map((key) => ({
        key,
        title: VEHICLE_CATEGORY_SECTION_TITLES[key],
        emptyMessage: VEHICLE_CATEGORY_EMPTY_MESSAGES[key],
        vehicles: list === null ? null : list.filter((vehicle) => vehicle.category === key),
      }));
  });

  protected readonly resultCount = computed(() => this.filtered()?.length ?? null);

  constructor() {
    void this.settingsService.load().then((settings) => this.settings.set(settings));
    this.load();

    this.seo.applyPage({
      title: 'جميع العربيات',
      description:
        'اتفرج على كل عربيات ربع النقل والميكروباص والملاكي المتاحة في معرض الأندلس، بأسعارها ومواصفاتها.',
      path: '/vehicles',
    });
  }

  protected load(): void {
    this.failed.set(false);
    this.all.set(null);

    this.vehicleService.listPublic().then(
      (list) => this.all.set(list),
      () => this.failed.set(true),
    );
  }

  protected selectCategory(value: CategoryFilter): void {
    void this.navigate({ ...this.selection(), category: value });
  }

  protected applyFilters(selection: FilterSelection): void {
    this.sheetOpen.set(false);
    void this.navigate(selection);
  }

  protected clearSearch(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: null },
      queryParamsHandling: 'merge',
    });
  }

  private navigate(selection: FilterSelection): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        category: selection.category === 'all' ? null : selection.category,
        brand: selection.brand || null,
        price: selection.price || null,
      },
      queryParamsHandling: 'merge',
    });
  }

  private parsePriceKey(key: string): readonly [number, number] | null {
    const [min, max] = key.split('-').map(Number);
    return Number.isFinite(min) && Number.isFinite(max) ? [min, max] : null;
  }
}
