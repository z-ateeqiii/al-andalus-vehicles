import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, afterNextRender, computed, inject, signal } from '@angular/core';
import { Vehicle } from '../models/vehicle.model';

const STORAGE_KEY = 'al-andalus:favorites';

/**
 * Saved vehicles, in `localStorage` only.
 *
 * There are no customer accounts in this project (CLAUDE.md §1), so favourites
 * live on the one device that saved them.
 *
 * The stored list is read in `afterNextRender` rather than in the constructor:
 * the server renders zero favourites, and reading during hydration would make
 * the markup disagree with itself.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly ids = signal<readonly string[]>([]);

  readonly all = this.ids.asReadonly();
  readonly count = computed(() => this.ids().length);

  constructor() {
    afterNextRender(() => this.ids.set(this.read()));
  }

  /** Reactive inside templates — reads the signal. */
  has(id: string): boolean {
    return this.ids().includes(id);
  }

  add(id: string): void {
    if (!this.has(id)) {
      this.commit([...this.ids(), id]);
    }
  }

  remove(id: string): void {
    this.commit(this.ids().filter((saved) => saved !== id));
  }

  /** Resolves to the new state, so the caller can toast the right message. */
  toggle(id: string): boolean {
    const nowSaved = !this.has(id);
    if (nowSaved) {
      this.add(id);
    } else {
      this.remove(id);
    }
    return nowSaved;
  }

  clear(): void {
    this.commit([]);
  }

  /**
   * The saved vehicles, in the order they were saved. Anything that has since
   * sold or been hidden simply drops out, because it is no longer in the
   * public list this is filtered against.
   */
  pick(vehicles: readonly Vehicle[]): Vehicle[] {
    const saved = this.ids();
    const byId = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

    return saved
      .map((id) => byId.get(id))
      .filter((vehicle): vehicle is Vehicle => vehicle !== undefined);
  }

  private commit(next: readonly string[]): void {
    this.ids.set(next);

    if (!this.isBrowser) {
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage full or blocked: the list still works for this session.
    }
  }

  private read(): readonly string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === 'string')
        : [];
    } catch {
      return [];
    }
  }
}
