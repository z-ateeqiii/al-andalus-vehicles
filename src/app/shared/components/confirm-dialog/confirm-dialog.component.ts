import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/**
 * Blocks a destructive action until the owner confirms it.
 *
 * The confirm button is the dangerous one, so it is never the default focus
 * and never styled as the primary action. The message always names the thing
 * being destroyed — "امسح العربية" alone is not enough to act on.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [IconComponent],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'cancel.emit()',
  },
})
export class ConfirmDialogComponent {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly open = input(false);
  readonly title = input.required<string>();

  /** Names exactly what is about to happen, and to what. */
  readonly message = input('');

  readonly confirmLabel = input('امسح');
  readonly cancelLabel = input('إلغاء');

  /** Shows a spinner and blocks a second press. */
  readonly working = input(false);

  readonly confirm = output<void>();
  readonly cancel = output<void>();

  constructor() {
    // Hold the page still behind the dialog.
    effect(() => {
      if (!this.isBrowser) {
        return;
      }
      document.body.style.overflow = this.open() ? 'hidden' : '';
    });
  }
}
