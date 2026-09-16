import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Only `secureUrl` and `publicId` are stored in Firestore. */
export interface UploadedImage {
  readonly secureUrl: string;
  readonly publicId: string;
  readonly width: number;
  readonly height: number;
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

/** The widths every `srcset` is generated across. */
export const IMAGE_WIDTHS: readonly number[] = [400, 800, 1200, 1600];

const UPLOAD_ENDPOINT = `https://api.cloudinary.com/v1_1/${environment.cloudinary.cloudName}/image/upload`;

const UPLOAD_MARKER = '/image/upload/';

interface CloudinaryUploadResponse {
  readonly secure_url?: string;
  readonly public_id?: string;
  readonly width?: number;
  readonly height?: number;
  readonly error?: { readonly message?: string };
}

/**
 * Unsigned Cloudinary uploads and delivery-URL transformations.
 *
 * The preset applies `c_limit,w_2400,q_auto` on ingest but enforces no size or
 * format limit server-side, so the checks in `validate` are the only thing
 * standing between the owner and a 40MB TIFF. They run before a single byte
 * is sent.
 *
 * Never put a Cloudinary API secret in this file — the preset is unsigned by
 * design (CLAUDE.md §5).
 */
@Injectable({ providedIn: 'root' })
export class CloudinaryService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Returns an Egyptian Arabic message, or `null` when the file is fine. */
  validate(file: File): string | null {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return 'الصورة لازم تكون JPG أو PNG أو WEBP';
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return 'الصورة كبيرة أوي، أقصى حجم 8 ميجا';
    }

    return null;
  }

  /**
   * Uploads one file, reporting 0-100 progress.
   *
   * `XMLHttpRequest` rather than `fetch` because only XHR reports upload
   * progress, which the add-vehicle form shows per file.
   */
  upload(
    file: File,
    options: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
  ): Promise<UploadedImage> {
    if (!this.isBrowser) {
      return Promise.reject(new Error('رفع الصور بيشتغل من المتصفح بس'));
    }

    const invalid = this.validate(file);
    if (invalid) {
      return Promise.reject(new Error(invalid));
    }

    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', environment.cloudinary.uploadPreset);
    form.append('folder', environment.cloudinary.folder);

    return new Promise<UploadedImage>((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', UPLOAD_ENDPOINT);

      request.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          options.onProgress?.(Math.round((event.loaded / event.total) * 100));
        }
      });

      request.addEventListener('load', () => {
        let payload: CloudinaryUploadResponse;
        try {
          payload = JSON.parse(request.responseText) as CloudinaryUploadResponse;
        } catch {
          reject(new Error('حصلت مشكلة وإحنا بنرفع الصورة، حاول تاني'));
          return;
        }

        if (request.status < 200 || request.status >= 300 || !payload.secure_url) {
          reject(new Error('حصلت مشكلة وإحنا بنرفع الصورة، حاول تاني'));
          return;
        }

        resolve({
          secureUrl: payload.secure_url,
          publicId: payload.public_id ?? '',
          width: payload.width ?? 0,
          height: payload.height ?? 0,
        });
      });

      request.addEventListener('error', () => {
        reject(new Error('النت مش شغال، اتأكد من الاتصال وحاول تاني'));
      });

      request.addEventListener('abort', () => {
        reject(new Error('تم إلغاء رفع الصورة'));
      });

      options.signal?.addEventListener('abort', () => request.abort(), { once: true });

      request.send(form);
    });
  }

  /**
   * Adds `f_auto,q_auto` and a width to a Cloudinary delivery URL.
   *
   * Anything that is not a Cloudinary URL — a seeded placeholder, say — is
   * returned untouched rather than mangled.
   */
  transform(url: string, width: number): string {
    if (!url.includes(UPLOAD_MARKER)) {
      return url;
    }

    return url.replace(UPLOAD_MARKER, `${UPLOAD_MARKER}f_auto,q_auto,w_${width}/`);
  }

  /** `srcset` across 400/800/1200/1600 so covers never pull the original. */
  srcset(url: string, widths: readonly number[] = IMAGE_WIDTHS): string {
    if (!url.includes(UPLOAD_MARKER)) {
      return '';
    }

    return widths.map((width) => `${this.transform(url, width)} ${width}w`).join(', ');
  }

  /**
   * Same as {@link transform}, with extra Cloudinary directives appended —
   * `c_pad,ar_9:16,g_south,b_rgb:0F0D0A`, say.
   *
   * This is how art direction works here: a landscape photo cannot show its
   * whole subject inside a tall phone viewport, so the mobile variant is a
   * genuinely different crop rather than the same one squeezed.
   */
  transformWith(url: string, width: number, extra: string): string {
    if (!url.includes(UPLOAD_MARKER)) {
      return url;
    }

    const directives = extra ? `f_auto,q_auto,w_${width},${extra}` : `f_auto,q_auto,w_${width}`;
    return url.replace(UPLOAD_MARKER, `${UPLOAD_MARKER}${directives}/`);
  }

  /** `srcset` for an art-directed variant. */
  srcsetWith(url: string, extra: string, widths: readonly number[] = IMAGE_WIDTHS): string {
    if (!url.includes(UPLOAD_MARKER)) {
      return '';
    }

    return widths.map((width) => `${this.transformWith(url, width, extra)} ${width}w`).join(', ');
  }
}
