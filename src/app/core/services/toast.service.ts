import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  readonly id: number;
  readonly kind: ToastKind;
  readonly message: string;
}

const DEFAULT_DURATION_MS = 4000;

/**
 * Hand-rolled toast queue — no toast library, see CLAUDE.md §2.
 *
 * Auto-dismiss timers only run in the browser: on the server a pending
 * `setTimeout` would hold the SSR render open.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private nextId = 0;

  private readonly queue = signal<readonly Toast[]>([]);

  readonly toasts = this.queue.asReadonly();

  /** `تمت إضافة العربية` */
  success(message: string, durationMs = DEFAULT_DURATION_MS): number {
    return this.show('success', message, durationMs);
  }

  /** `حصلت مشكلة، حاول تاني` */
  error(message: string, durationMs = DEFAULT_DURATION_MS): number {
    return this.show('error', message, durationMs);
  }

  warning(message: string, durationMs = DEFAULT_DURATION_MS): number {
    return this.show('warning', message, durationMs);
  }

  info(message: string, durationMs = DEFAULT_DURATION_MS): number {
    return this.show('info', message, durationMs);
  }

  dismiss(id: number): void {
    this.queue.update((list) => list.filter((toast) => toast.id !== id));
  }

  clear(): void {
    this.queue.set([]);
  }

  /** Pass `durationMs = 0` to keep a toast up until it is dismissed by hand. */
  private show(kind: ToastKind, message: string, durationMs: number): number {
    const id = ++this.nextId;
    this.queue.update((list) => [...list, { id, kind, message }]);

    if (this.isBrowser && durationMs > 0) {
      setTimeout(() => this.dismiss(id), durationMs);
    }

    return id;
  }
}
