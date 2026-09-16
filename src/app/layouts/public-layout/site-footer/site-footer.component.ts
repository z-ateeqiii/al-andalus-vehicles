import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShowroomSettings } from '../../../core/models/showroom-settings.model';
import { SettingsService } from '../../../core/services/settings.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { IconName } from '../../../shared/components/icon/icon-paths';
import { LogoComponent } from '../../../shared/components/logo/logo.component';

interface SocialLink {
  readonly icon: IconName;
  readonly url: string;
  readonly label: string;
}

/**
 * Public footer. Contact details and social links come from
 * `settings/showroom`, so the owner changes them without a deploy.
 */
@Component({
  selector: 'app-site-footer',
  imports: [RouterLink, IconComponent, LogoComponent],
  templateUrl: './site-footer.component.html',
  styleUrl: './site-footer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteFooterComponent {
  private readonly settingsService = inject(SettingsService);

  protected readonly year = new Date().getFullYear();
  protected readonly settings = signal<ShowroomSettings | null>(null);

  protected readonly quickLinks = [
    { label: 'الرئيسية', path: '/' },
    { label: 'المركبات', path: '/vehicles' },
    { label: 'المفضلة', path: '/favorites' },
  ];

  /**
   * Only the links the owner has actually filled in. An empty value produces
   * no entry at all — never a dead link or a greyed-out icon — and when both
   * are empty the row disappears with them.
   */
  protected readonly socials = computed<readonly SocialLink[]>(() => {
    const showroom = this.settings();
    if (!showroom) {
      return [];
    }

    const candidates: readonly SocialLink[] = [
      { icon: 'facebook', url: showroom.facebookUrl?.trim() ?? '', label: 'فيسبوك' },
      { icon: 'tiktok', url: showroom.tiktokUrl?.trim() ?? '', label: 'تيك توك' },
    ];

    return candidates.filter((link) => link.url !== '');
  });

  constructor() {
    void this.settingsService.load().then((settings) => this.settings.set(settings));
  }
}
