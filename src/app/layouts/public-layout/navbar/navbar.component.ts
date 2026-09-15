import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { LogoComponent } from '../../../shared/components/logo/logo.component';
import { NavLink } from '../nav-links';

/** Storyboard panels 01, 02 and 05. */
@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive, IconComponent, LogoComponent],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarComponent {
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly links = input.required<readonly NavLink[]>();

  /** True on the home page, where the navbar floats over the hero. */
  readonly overHero = input(false);

  readonly openDrawer = output<void>();

  protected readonly searchOpen = signal(false);
  protected readonly query = signal('');

  private readonly scrolled = signal(false);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  /** Transparent over the hero until the visitor scrolls; solid ink after. */
  protected readonly transparent = computed(() => this.overHero() && !this.scrolled());

  constructor() {
    afterNextRender(() => {
      const update = () => this.scrolled.set(window.scrollY > 24);
      update();
      window.addEventListener('scroll', update, { passive: true });
    });

    effect(() => {
      if (this.isBrowser && this.searchOpen()) {
        this.searchInput()?.nativeElement.focus();
      }
    });
  }

  protected toggleSearch(): void {
    this.searchOpen.update((open) => !open);
  }

  protected submitSearch(): void {
    const q = this.query().trim();
    this.searchOpen.set(false);
    this.router.navigate(['/vehicles'], { queryParams: q ? { q } : {} });
  }

  protected onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.searchOpen.set(false);
    }
  }
}
