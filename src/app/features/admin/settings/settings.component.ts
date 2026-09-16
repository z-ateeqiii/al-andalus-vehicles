import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ShowroomSettingsDraft } from '../../../core/models/showroom-settings.model';
import { SettingsService } from '../../../core/services/settings.service';
import { ToastService } from '../../../core/services/toast.service';
import { CloudImageComponent } from '../../../shared/components/cloud-image/cloud-image.component';
import { ImageUploadComponent } from '../../../shared/components/image-upload/image-upload.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';

/**
 * Empty is valid — a missing social account is the normal case, not an
 * error. Anything else has to be a real http(s) address, because it goes
 * straight into an `href`.
 */
function optionalUrl(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? null : { url: true };
  } catch {
    return { url: true };
  }
}

/**
 * Everything the owner can change about the showroom without a deploy.
 *
 * The hero image is the headline case: swapping it here is the whole reason
 * `settings/showroom` exists (build spec §8.5).
 */
@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, ImageUploadComponent, CloudImageComponent, SkeletonComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent {
  private readonly settingsService = inject(SettingsService);
  private readonly toast = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);

  /** The uploader writes into these; only the first image is ever used. */
  protected readonly heroImages = signal<readonly string[]>([]);
  protected readonly heroCover = signal('');

  protected readonly form = this.formBuilder.nonNullable.group({
    showroomName: ['', [Validators.required]],
    heroHeading: ['', [Validators.required]],
    heroSubheading: [''],
    heroDescription: [''],
    whatsappNumber: ['', [Validators.required]],
    phoneNumber: [''],
    address: [''],
    workingHours: [''],
    facebookUrl: ['', [optionalUrl]],
    tiktokUrl: ['', [optionalUrl]],
    showPassengerVehicles: [true],
  });

  constructor() {
    void this.settingsService.load().then((settings) => {
      this.form.patchValue({
        showroomName: settings.showroomName,
        heroHeading: settings.heroHeading,
        heroSubheading: settings.heroSubheading,
        heroDescription: settings.heroDescription,
        whatsappNumber: settings.whatsappNumber,
        phoneNumber: settings.phoneNumber ?? '',
        address: settings.address ?? '',
        workingHours: settings.workingHours ?? '',
        facebookUrl: settings.facebookUrl ?? '',
        tiktokUrl: settings.tiktokUrl ?? '',
        showPassengerVehicles: settings.showPassengerVehicles,
      });

      if (settings.heroImageUrl) {
        this.heroImages.set([settings.heroImageUrl]);
        this.heroCover.set(settings.heroImageUrl);
      }

      this.loading.set(false);
    });
  }

  protected requiredError(field: 'showroomName' | 'heroHeading' | 'whatsappNumber'): string {
    const control = this.form.controls[field];
    return control.touched && control.hasError('required') ? 'الحقل ده مطلوب' : '';
  }

  protected urlError(field: 'facebookUrl' | 'tiktokUrl'): string {
    const control = this.form.controls[field];
    return control.touched && control.hasError('url') ? 'اكتب لينك صحيح يبدأ بـ https://' : '';
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();

    if (this.form.invalid || this.saving()) {
      return;
    }

    this.saving.set(true);

    try {
      const value = this.form.getRawValue();

      const draft: ShowroomSettingsDraft = {
        ...value,
        // Digits only: the WhatsApp link builds a wa.me URL from this.
        whatsappNumber: value.whatsappNumber.replace(/\D/g, ''),
        // Trimmed, so a field of spaces counts as empty and hides its icon.
        facebookUrl: value.facebookUrl.trim(),
        tiktokUrl: value.tiktokUrl.trim(),
        heroImageUrl: this.heroCover(),
      };

      await this.settingsService.save(draft);
      this.toast.success('تم حفظ الإعدادات');
    } catch {
      this.toast.error('حصلت مشكلة، حاول تاني');
    } finally {
      this.saving.set(false);
    }
  }
}
