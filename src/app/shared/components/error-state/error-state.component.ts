import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/**
 * Something failed to load. Always offers a way back in — `حاول تاني`.
 * Never leaks a raw exception message to the visitor.
 */
@Component({
  selector: 'app-error-state',
  imports: [IconComponent],
  templateUrl: './error-state.component.html',
  styleUrl: './error-state.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class ErrorStateComponent {
  readonly title = input('حصلت مشكلة، حاول تاني');

  readonly message = input('مقدرناش نجيب البيانات دلوقتي. اتأكد إن النت شغال وجرّب تاني.');

  readonly retryLabel = input('حاول تاني');

  readonly retry = output<void>();
}
