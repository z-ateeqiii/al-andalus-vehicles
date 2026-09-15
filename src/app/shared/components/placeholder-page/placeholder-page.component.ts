import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IconComponent } from '../icon/icon.component';

/**
 * TEMPORARY route stub.
 *
 * It exists so the two layouts are reachable and server-renderable before the
 * feature pages are built. Every route using it is replaced by the real page
 * in a later increment — when the last one goes, delete this component.
 */
@Component({
  selector: 'app-placeholder-page',
  imports: [IconComponent],
  templateUrl: './placeholder-page.component.html',
  styleUrl: './placeholder-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class PlaceholderPageComponent {
  private readonly route = inject(ActivatedRoute);

  protected readonly title = String(this.route.snapshot.data['title'] ?? 'الصفحة');
}
