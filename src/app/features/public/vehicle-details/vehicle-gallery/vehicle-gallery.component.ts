import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { CloudImageComponent } from '../../../../shared/components/cloud-image/cloud-image.component';
import { IconComponent } from '../../../../shared/components/icon/icon.component';

const SWIPE_THRESHOLD_PX = 40;

/**
 * The details page gallery: one large image with prev/next arrows, a
 * thumbnail strip, keyboard arrows and touch swipe (build spec §6.5).
 *
 * In an RTL document the visual "next" arrow points to the left, so the
 * arrow buttons and the swipe direction are both mirrored against reading
 * order rather than against the screen.
 */
@Component({
  selector: 'app-vehicle-gallery',
  imports: [CloudImageComponent, IconComponent],
  templateUrl: './vehicle-gallery.component.html',
  styleUrl: './vehicle-gallery.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
})
export class VehicleGalleryComponent {
  readonly images = input.required<readonly string[]>();
  readonly alt = input('');

  protected readonly index = signal(0);

  private touchStartX = 0;

  protected readonly current = computed(() => this.images()[this.index()] ?? '');
  protected readonly hasMany = computed(() => this.images().length > 1);

  constructor() {
    // A different vehicle means starting from its own first photo.
    effect(() => {
      this.images();
      this.index.set(0);
    });
  }

  protected select(index: number): void {
    this.index.set(index);
  }

  protected next(): void {
    const count = this.images().length;
    if (count > 1) {
      this.index.update((i) => (i + 1) % count);
    }
  }

  protected previous(): void {
    const count = this.images().length;
    if (count > 1) {
      this.index.update((i) => (i - 1 + count) % count);
    }
  }

  /** ArrowRight moves toward the start of an RTL document, so it goes back. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.previous();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.next();
    }
  }

  protected onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.changedTouches[0]?.clientX ?? 0;
  }

  protected onTouchEnd(event: TouchEvent): void {
    const endX = event.changedTouches[0]?.clientX ?? 0;
    const delta = endX - this.touchStartX;

    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) {
      return;
    }

    // Dragging toward the left pulls the next photo in, matching the arrows.
    if (delta < 0) {
      this.next();
    } else {
      this.previous();
    }
  }
}
