import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { LogoComponent } from '../../../shared/components/logo/logo.component';

/**
 * Public footer.
 *
 * TODO(settings): phone, address and working hours move to the Firestore
 * `settings/showroom` document once SettingsService lands. The placeholders
 * below are marked so they are impossible to ship by accident.
 */
@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, IconComponent, LogoComponent],
  templateUrl: './site-footer.component.html',
  styleUrl: './site-footer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteFooterComponent {
  protected readonly year = new Date().getFullYear();

  protected readonly quickLinks = [
    { label: 'الرئيسية', path: '/' },
    { label: 'المركبات', path: '/vehicles' },
    { label: 'المفضلة', path: '/favorites' },
  ];
}
