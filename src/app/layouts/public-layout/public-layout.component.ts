import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AnalyticsService } from '../../core/services/analytics.service';
import { ToastComponent } from '../../shared/components/toast/toast.component';
import { BottomTabBarComponent } from './bottom-tab-bar/bottom-tab-bar.component';
import { MobileDrawerComponent } from './mobile-drawer/mobile-drawer.component';
import { NavbarComponent } from './navbar/navbar.component';
import { PUBLIC_NAV_LINKS } from './nav-links';
import { SiteFooterComponent } from './site-footer/site-footer.component';

/**
 * Chrome for every public page: navbar, mobile drawer, footer, mobile tab
 * bar and the toast stack.
 */
@Component({
  selector: 'app-public-layout',
  imports: [
    RouterOutlet,
    NavbarComponent,
    MobileDrawerComponent,
    BottomTabBarComponent,
    SiteFooterComponent,
    ToastComponent,
  ],
  templateUrl: './public-layout.component.html',
  styleUrl: './public-layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicLayoutComponent {
  private readonly router = inject(Router);
  private readonly analytics = inject(AnalyticsService);

  protected readonly links = PUBLIC_NAV_LINKS;
  protected readonly drawerOpen = signal(false);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /**
   * The home hero runs under a transparent navbar; every other page needs
   * the fixed navbar's height as top padding instead.
   */
  protected readonly isHome = computed(() => this.currentUrl().split(/[?#]/)[0] === '/');

  constructor() {
    // The only metric this project tracks. Browser-only and deduplicated per
    // session inside the service, so crawlers and SSR never inflate it.
    afterNextRender(() => void this.analytics.recordVisit());
  }
}
