import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CloudinaryService } from '../../../core/services/cloudinary.service';

/**
 * Every image on the public site goes through here, so the delivery rules in
 * CLAUDE.md §5 live in one place: `f_auto,q_auto` plus a width, a `srcset`
 * across 400/800/1200/1600, `loading="lazy"` and explicit dimensions —
 * except the hero, which is eager and `fetchpriority="high"`.
 *
 * A non-Cloudinary URL (a seeded placeholder) is rendered as-is with no
 * `srcset`, rather than mangled into a broken transformation.
 */
@Component({
  selector: 'app-cloud-image',
  imports: [],
  templateUrl: './cloud-image.component.html',
  styleUrl: './cloud-image.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class CloudImageComponent {
  private readonly cloudinary = inject(CloudinaryService);

  readonly src = input.required<string>();
  readonly alt = input('');

  /** The `sizes` attribute. Get this right or the srcset picks badly. */
  readonly sizes = input('100vw');

  /** Intrinsic dimensions — set them, or the page shifts as images land. */
  readonly width = input<number | null>(null);
  readonly height = input<number | null>(null);

  /** Width used for the plain `src` fallback. */
  readonly baseWidth = input(800);

  /**
   * The LCP candidate: eager, `fetchpriority="high"`, decoded synchronously.
   * At most one image per page should carry this — several high-priority
   * images only compete with each other.
   */
  readonly priority = input(false);

  /**
   * Above the fold but not the LCP candidate: eager, so the browser does not
   * deprioritise it the way it does a lazy image, but at normal priority.
   */
  readonly eager = input(false);

  readonly imgClass = input('');

  protected readonly resolved = computed(() =>
    this.cloudinary.transform(this.src(), this.baseWidth()),
  );

  protected readonly srcset = computed(() => this.cloudinary.srcset(this.src()) || null);

  protected readonly loading = computed(() => (this.priority() || this.eager() ? 'eager' : 'lazy'));
}
