import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  model,
  signal,
} from '@angular/core';
import { CloudinaryService } from '../../../core/services/cloudinary.service';
import { ToastService } from '../../../core/services/toast.service';
import { IconComponent } from '../icon/icon.component';

interface UploadItem {
  readonly key: string;
  /** The Cloudinary `secure_url`, empty until the upload finishes. */
  readonly url: string;
  /** Object URL shown while the file is still going up. */
  readonly preview: string;
  readonly progress: number;
  readonly uploading: boolean;
  readonly failed: boolean;
  readonly name: string;
}

let nextKey = 0;

/**
 * Drag-and-drop uploader for a vehicle's photos.
 *
 * Files are validated before a byte is sent — the unsigned preset enforces no
 * size or format limit server-side — and each one shows its own progress.
 * Removing a photo before saving only touches this component's state; nothing
 * is written to Firestore until the form is submitted.
 *
 * Clicking any thumbnail promotes it to the cover, which is the image the
 * card and the link preview use.
 */
@Component({
  selector: 'app-image-upload',
  imports: [IconComponent],
  templateUrl: './image-upload.component.html',
  styleUrl: './image-upload.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class ImageUploadComponent {
  private readonly cloudinary = inject(CloudinaryService);
  private readonly toast = inject(ToastService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Every uploaded photo, in display order. Two-way bound to the form. */
  readonly images = model<readonly string[]>([]);

  /** The cover photo's URL. Must be one of {@link images}. */
  readonly cover = model<string>('');

  protected readonly items = signal<readonly UploadItem[]>([]);
  protected readonly dragging = signal(false);

  protected readonly busy = computed(() => this.items().some((item) => item.uploading));

  private seeded = false;

  constructor() {
    // Edit mode arrives with existing URLs; show them as finished uploads.
    // Runs once, so later edits to `items` are not clobbered.
    const seed = () => {
      if (this.seeded) {
        return;
      }
      const existing = this.images();
      if (existing.length === 0) {
        return;
      }
      this.seeded = true;
      this.items.set(
        existing.map((url) => ({
          key: `seed-${nextKey++}`,
          url,
          preview: '',
          progress: 100,
          uploading: false,
          failed: false,
          name: '',
        })),
      );
    };
    seed();
    queueMicrotask(seed);
  }

  protected thumbOf(item: UploadItem): string {
    return item.url ? this.cloudinary.transform(item.url, 400) : item.preview;
  }

  protected isCover(item: UploadItem): boolean {
    return item.url !== '' && item.url === this.cover();
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(): void {
    this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.accept(event.dataTransfer?.files ?? null);
  }

  protected onPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.accept(input.files);
    // Let the same file be picked again after a removal.
    input.value = '';
  }

  protected remove(item: UploadItem): void {
    if (item.preview) {
      URL.revokeObjectURL(item.preview);
    }

    this.items.update((list) => list.filter((entry) => entry.key !== item.key));
    this.publish();
  }

  protected promote(item: UploadItem): void {
    if (item.url) {
      this.cover.set(item.url);
    }
  }

  private accept(files: FileList | null): void {
    if (!files || !this.isBrowser) {
      return;
    }

    for (const file of Array.from(files)) {
      const problem = this.cloudinary.validate(file);

      if (problem) {
        this.toast.error(`${file.name}: ${problem}`);
        continue;
      }

      void this.upload(file);
    }
  }

  private async upload(file: File): Promise<void> {
    const key = `up-${nextKey++}`;
    const preview = URL.createObjectURL(file);

    this.items.update((list) => [
      ...list,
      { key, url: '', preview, progress: 0, uploading: true, failed: false, name: file.name },
    ]);

    try {
      const uploaded = await this.cloudinary.upload(file, {
        onProgress: (percent) => this.patch(key, { progress: percent }),
      });

      this.patch(key, { url: uploaded.secureUrl, uploading: false, progress: 100 });
      this.publish();
    } catch (error) {
      this.patch(key, { uploading: false, failed: true });
      this.toast.error(error instanceof Error ? error.message : 'حصلت مشكلة، حاول تاني');
    }
  }

  private patch(key: string, changes: Partial<UploadItem>): void {
    this.items.update((list) =>
      list.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    );
  }

  /** Pushes the finished uploads up to the form, and keeps a cover set. */
  private publish(): void {
    const urls = this.items()
      .filter((item) => item.url !== '')
      .map((item) => item.url);

    this.images.set(urls);

    // The first photo becomes the cover by default, and a removed cover hands
    // the job to whatever is left rather than leaving the vehicle without one.
    if (!urls.includes(this.cover())) {
      this.cover.set(urls[0] ?? '');
    }
  }
}
