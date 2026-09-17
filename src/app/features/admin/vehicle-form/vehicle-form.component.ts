import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  VEHICLE_CATEGORY_LABELS,
  VEHICLE_CATEGORY_ORDER,
  Vehicle,
  VehicleCategory,
  VehicleDraft,
  VehicleStatus,
} from '../../../core/models/vehicle.model';
import { ToastService } from '../../../core/services/toast.service';
import { VehicleService } from '../../../core/services/vehicle.service';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ImageUploadComponent } from '../../../shared/components/image-upload/image-upload.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';

const MIN_YEAR = 1990;

/** Shown on blur or submit, in Egyptian Arabic, under the field itself. */
const MESSAGES: Record<string, string> = {
  required: 'الحقل ده مطلوب',
  min: 'القيمة صغيرة أوي',
  max: 'القيمة كبيرة أوي',
};

@Component({
  selector: 'app-vehicle-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ImageUploadComponent,
    ErrorStateComponent,
    IconComponent,
    SkeletonComponent,
  ],
  templateUrl: './vehicle-form.component.html',
  styleUrl: './vehicle-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehicleFormComponent {
  private readonly vehicleService = inject(VehicleService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  /** Present on /admin/vehicles/edit/:id, absent on /new. */
  readonly id = input<string | undefined>(undefined);

  protected readonly maxYear = new Date().getFullYear() + 1;
  protected readonly minYear = MIN_YEAR;

  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly submitting = signal(false);
  protected readonly extrasOpen = signal(false);

  /** Owned outside the reactive form: the uploader manages its own state. */
  protected readonly images = signal<readonly string[]>([]);
  protected readonly cover = signal('');
  protected readonly features = signal<readonly string[]>([]);
  protected readonly featureDraft = signal('');
  protected readonly showImageError = signal(false);

  protected readonly isEdit = computed(() => !!this.id());

  protected readonly categoryOptions = VEHICLE_CATEGORY_ORDER;
  protected readonly categoryLabels = VEHICLE_CATEGORY_LABELS;

  protected readonly form = this.formBuilder.nonNullable.group({
    category: ['pickup' as VehicleCategory, [Validators.required]],
    brand: ['', [Validators.required]],
    model: ['', [Validators.required]],
    year: [
      this.maxYear - 1,
      [Validators.required, Validators.min(MIN_YEAR), Validators.max(this.maxYear)],
    ],
    price: [0, [Validators.required, Validators.min(1)]],
    priceOnRequest: [false],
    status: ['available' as VehicleStatus, [Validators.required]],
    isFeatured: [false],
    color: [''],
    colorHex: ['#C0392B'],
    mileage: [null as number | null],
    engine: [''],
    power: [''],
    transmission: [''],
    fuelType: [''],
    payload: [''],
    bedType: [''],
    seats: [null as number | null],
    description: [''],
  });

  /** Bumped on every form change so the error computeds re-run. */
  private readonly formState = signal(0);

  protected readonly isPickup = computed(() => {
    this.formState();
    return this.form.controls.category.value === 'pickup';
  });

  protected readonly isMinibus = computed(() => {
    this.formState();
    return this.form.controls.category.value === 'minibus';
  });

  protected readonly priceDisabled = computed(() => {
    this.formState();
    return this.form.controls.priceOnRequest.value;
  });

  protected readonly coverMissing = computed(() => this.showImageError() && this.cover() === '');

  constructor() {
    this.form.valueChanges.subscribe(() => this.formState.update((n) => n + 1));
    this.form.statusChanges.subscribe(() => this.formState.update((n) => n + 1));

    // "السعر عند الاتصال" turns the price field off rather than hiding it, so
    // the owner can see what the checkbox did.
    this.form.controls.priceOnRequest.valueChanges.subscribe((onRequest) => {
      const price = this.form.controls.price;
      if (onRequest) {
        price.disable({ emitEvent: false });
        price.clearValidators();
      } else {
        price.enable({ emitEvent: false });
        price.setValidators([Validators.required, Validators.min(1)]);
      }
      price.updateValueAndValidity({ emitEvent: false });
      this.formState.update((n) => n + 1);
    });

    effect(() => {
      const id = this.id();
      if (id) {
        this.loadExisting(id);
      }
    });
  }

  protected errorFor(field: keyof typeof this.form.controls): string {
    this.formState();

    const control = this.form.controls[field];
    if (!control.touched || control.valid) {
      return '';
    }

    if (field === 'price' && (control.hasError('min') || control.hasError('required'))) {
      return 'اكتب سعر صحيح';
    }
    if (field === 'year' && (control.hasError('min') || control.hasError('max'))) {
      return `اكتب سنة بين ${MIN_YEAR} و ${this.maxYear}`;
    }

    for (const key of Object.keys(MESSAGES)) {
      if (control.hasError(key)) {
        return MESSAGES[key];
      }
    }

    return '';
  }

  protected retryLoad(): void {
    const id = this.id();
    if (id) {
      this.loadExisting(id);
    }
  }

  protected addFeature(): void {
    const value = this.featureDraft().trim();
    if (!value || this.features().includes(value)) {
      this.featureDraft.set('');
      return;
    }
    this.features.update((list) => [...list, value]);
    this.featureDraft.set('');
  }

  protected removeFeature(feature: string): void {
    this.features.update((list) => list.filter((item) => item !== feature));
  }

  protected onFeatureKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addFeature();
    }
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    this.showImageError.set(true);
    this.formState.update((n) => n + 1);

    if (this.form.invalid || this.cover() === '' || this.submitting()) {
      if (this.cover() === '') {
        this.toast.warning('لازم تضيف صورة غلاف للعربية');
      }
      return;
    }

    this.submitting.set(true);

    try {
      const draft = this.toDraft();
      const id = this.id();

      if (id) {
        await this.vehicleService.update(id, draft);
        this.toast.success('تم حفظ التعديلات');
      } else {
        await this.vehicleService.create(draft);
        this.toast.success('تمت إضافة العربية');
      }

      await this.router.navigate(['/admin/vehicles']);
    } catch {
      this.toast.error('حصلت مشكلة، حاول تاني');
    } finally {
      this.submitting.set(false);
    }
  }

  private toDraft(): VehicleDraft {
    const value = this.form.getRawValue();
    const pickup = value.category === 'pickup';
    const minibus = value.category === 'minibus';
    const onRequest = value.priceOnRequest;

    const optional = (text: string): string | undefined => text.trim() || undefined;

    return {
      category: value.category,
      brand: value.brand.trim(),
      model: value.model.trim(),
      year: Number(value.year),
      price: onRequest ? null : Number(value.price),
      priceOnRequest: onRequest,
      currency: 'EGP',
      status: value.status,
      isFeatured: value.isFeatured,
      color: optional(value.color),
      colorHex: value.color.trim() ? value.colorHex : undefined,
      mileage: value.mileage === null ? undefined : Number(value.mileage),
      engine: optional(value.engine),
      power: optional(value.power),
      transmission: optional(value.transmission),
      fuelType: optional(value.fuelType),
      // Category-specific fields never travel with the wrong category.
      payload: pickup ? optional(value.payload) : undefined,
      bedType: pickup ? optional(value.bedType) : undefined,
      seats: minibus && value.seats !== null ? Number(value.seats) : undefined,
      description: optional(value.description),
      features: this.features().length ? [...this.features()] : undefined,
      coverImageUrl: this.cover(),
      imageUrls: [...this.images()],
    };
  }

  private loadExisting(id: string): void {
    this.loading.set(true);
    this.loadFailed.set(false);

    this.vehicleService.get(id).then(
      (vehicle) => {
        if (vehicle) {
          this.fill(vehicle);
        } else {
          this.loadFailed.set(true);
        }
        this.loading.set(false);
      },
      () => {
        this.loadFailed.set(true);
        this.loading.set(false);
      },
    );
  }

  private fill(vehicle: Vehicle): void {
    this.form.patchValue({
      category: vehicle.category,
      brand: vehicle.brand,
      model: vehicle.model,
      year: vehicle.year,
      price: vehicle.price ?? 0,
      priceOnRequest: vehicle.priceOnRequest,
      status: vehicle.status,
      isFeatured: vehicle.isFeatured ?? false,
      color: vehicle.color ?? '',
      colorHex: vehicle.colorHex ?? '#C0392B',
      mileage: vehicle.mileage ?? null,
      engine: vehicle.engine ?? '',
      power: vehicle.power ?? '',
      transmission: vehicle.transmission ?? '',
      fuelType: vehicle.fuelType ?? '',
      payload: vehicle.payload ?? '',
      bedType: vehicle.bedType ?? '',
      seats: vehicle.seats ?? null,
      description: vehicle.description ?? '',
    });

    this.features.set(vehicle.features ?? []);

    // Existing photos are kept unless the owner removes them explicitly.
    const gallery = vehicle.imageUrls.includes(vehicle.coverImageUrl)
      ? vehicle.imageUrls
      : [vehicle.coverImageUrl, ...vehicle.imageUrls].filter(Boolean);

    this.images.set(gallery);
    this.cover.set(vehicle.coverImageUrl);

    // Anything filled in below the fold should be visible, not hidden.
    const hasExtras =
      !!vehicle.color ||
      !!vehicle.engine ||
      !!vehicle.description ||
      (vehicle.features?.length ?? 0) > 0;
    this.extrasOpen.set(hasExtras);
  }
}
