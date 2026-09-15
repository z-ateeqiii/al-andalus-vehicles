import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { ToastComponent } from '../../shared/components/toast/toast.component';
import { AuthService } from '../../core/auth/auth.service';
import { AdminSidebarComponent } from './admin-sidebar/admin-sidebar.component';

/**
 * Chrome for the admin area. Sidebar at the RTL start, a header carrying the
 * page title, and the toast stack. Client-rendered only — never SSR.
 */
@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, AdminSidebarComponent, IconComponent, ToastComponent],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminLayoutComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  protected readonly sidebarOpen = signal(false);

  /** Feature routes supply their own heading through `data: { title }`. */
  protected readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.deepestTitle()),
    ),
    { initialValue: this.deepestTitle() },
  );

  protected async logout(): Promise<void> {
    this.sidebarOpen.set(false);
    await this.auth.signOut();
    await this.router.navigate(['/admin/login']);
  }

  private deepestTitle(): string {
    let route = this.route;
    while (route.firstChild) {
      route = route.firstChild;
    }
    const title: unknown = route.snapshot.data['title'];
    return typeof title === 'string' ? title : 'لوحة التحكم';
  }
}
