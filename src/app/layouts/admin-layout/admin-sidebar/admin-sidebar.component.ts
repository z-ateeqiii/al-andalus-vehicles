import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { IconName } from '../../../shared/components/icon/icon-paths';
import { LogoComponent } from '../../../shared/components/logo/logo.component';

interface AdminNavItem {
  readonly label: string;
  readonly icon: IconName;
  readonly path: string;
}

/**
 * Admin navigation rail. Storyboard panel 04, mirrored to the RTL start.
 *
 * Exactly three destinations plus a pinned logout — the mockup's العملاء /
 * المبيعات / الرسائل items are illustrative and out of scope (CLAUDE.md §1).
 *
 * A fixed rail on desktop, an overlay drawer on mobile; both render the same
 * body template.
 */
@Component({
  selector: 'app-admin-sidebar',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, IconComponent, LogoComponent],
  templateUrl: './admin-sidebar.component.html',
  styleUrl: './admin-sidebar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'close.emit()',
  },
})
export class AdminSidebarComponent {
  /** Drawer visibility on mobile. The desktop rail ignores this. */
  readonly open = input(false);

  readonly close = output<void>();
  readonly logout = output<void>();

  protected readonly items: readonly AdminNavItem[] = [
    { label: 'لوحة التحكم', icon: 'dashboard', path: '/admin/dashboard' },
    { label: 'العربيات', icon: 'car', path: '/admin/vehicles' },
    { label: 'الإعدادات', icon: 'settings', path: '/admin/settings' },
  ];
}
