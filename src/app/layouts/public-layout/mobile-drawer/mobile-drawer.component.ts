import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { LogoComponent } from '../../../shared/components/logo/logo.component';
import { NavLink } from '../nav-links';

/**
 * Full-screen mobile menu, sliding in from the RTL start side.
 * Storyboard panel 05.
 */
@Component({
  selector: 'app-mobile-drawer',
  imports: [RouterLink, RouterLinkActive, IconComponent, LogoComponent],
  templateUrl: './mobile-drawer.component.html',
  styleUrl: './mobile-drawer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'close.emit()',
  },
})
export class MobileDrawerComponent {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly open = input(false);

  readonly links = input.required<readonly NavLink[]>();

  readonly close = output<void>();

  constructor() {
    // Hold the page still behind the drawer.
    effect(() => {
      if (!this.isBrowser) {
        return;
      }
      document.body.style.overflow = this.open() ? 'hidden' : '';
    });
  }
}
