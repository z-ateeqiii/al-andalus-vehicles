import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Toast, ToastKind, ToastService } from '../../../core/services/toast.service';
import { IconComponent } from '../icon/icon.component';
import { IconName } from '../icon/icon-paths';

const ICON_BY_KIND: Record<ToastKind, IconName> = {
  success: 'check-circle',
  error: 'alert-circle',
  warning: 'alert-triangle',
  info: 'info',
};

const ACCENT_BY_KIND: Record<ToastKind, string> = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-gold',
};

/**
 * The toast stack. Mount once, in each layout.
 * Top of the viewport on mobile, bottom-start on desktop.
 */
@Component({
  selector: 'app-toast',
  imports: [IconComponent],
  templateUrl: './toast.component.html',
  styleUrl: './toast.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastComponent {
  private readonly toastService = inject(ToastService);

  protected readonly toasts = this.toastService.toasts;

  protected iconFor(toast: Toast): IconName {
    return ICON_BY_KIND[toast.kind];
  }

  protected accentFor(toast: Toast): string {
    return ACCENT_BY_KIND[toast.kind];
  }

  protected dismiss(id: number): void {
    this.toastService.dismiss(id);
  }
}
