import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { LogoComponent } from '../../../shared/components/logo/logo.component';

/**
 * The only way into the admin area. There is no sign-up and no password
 * reset — the account is created by hand in the Firebase console.
 *
 * Every failure shows one message. Telling the owner "this email has no
 * account" would also tell anyone else, which is how you hand an attacker a
 * list of valid addresses (build spec §12).
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, IconComponent, LogoComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly showPassword = signal(false);

  protected readonly emailError = computed(() => this.errorFor('email'));
  protected readonly passwordError = computed(() => this.errorFor('password'));

  /** Recomputes on every status change so messages appear on blur. */
  private readonly formState = signal(0);

  constructor() {
    this.form.statusChanges.subscribe(() => this.formState.update((n) => n + 1));
    this.form.valueChanges.subscribe(() => this.formState.update((n) => n + 1));
  }

  protected async submit(): Promise<void> {
    this.form.markAllAsTouched();
    this.formState.update((n) => n + 1);
    this.errorMessage.set('');

    if (this.form.invalid || this.submitting()) {
      return;
    }

    this.submitting.set(true);

    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.signIn(email, password);
      await this.router.navigate(['/admin/dashboard']);
    } catch (error) {
      // AuthService has already reduced this to one safe Arabic message.
      this.errorMessage.set(error instanceof Error ? error.message : 'حصلت مشكلة، حاول تاني');
    } finally {
      this.submitting.set(false);
    }
  }

  protected togglePassword(): void {
    this.showPassword.update((shown) => !shown);
  }

  private errorFor(field: 'email' | 'password'): string {
    // Read the counter so this recomputes when the form changes.
    this.formState();

    const control = this.form.controls[field];
    if (!control.touched || control.valid) {
      return '';
    }

    if (control.hasError('required')) {
      return 'الحقل ده مطلوب';
    }
    if (control.hasError('email')) {
      return 'اكتب إيميل صحيح';
    }

    return '';
  }
}
