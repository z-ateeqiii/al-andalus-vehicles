import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { IconName } from '../../../shared/components/icon/icon-paths';

interface Tab {
  readonly label: string;
  readonly icon: IconName;
  readonly path: string;
  readonly fragment?: string;
  readonly exact?: boolean;
}

/**
 * Fixed mobile tab bar, on every public page. Storyboard panel 05.
 */
@Component({
  selector: 'app-bottom-tab-bar',
  imports: [RouterLink, RouterLinkActive, IconComponent],
  templateUrl: './bottom-tab-bar.component.html',
  styleUrl: './bottom-tab-bar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BottomTabBarComponent {
  protected readonly tabs: readonly Tab[] = [
    { label: 'الرئيسية', icon: 'home', path: '/', exact: true },
    { label: 'المركبات', icon: 'car', path: '/vehicles' },
    { label: 'المفضلة', icon: 'heart', path: '/favorites' },
    // TODO(whatsapp): becomes a wa.me link once WhatsAppService and the
    // Firestore settings document exist. Scrolls to the contact band for now.
    { label: 'تواصل معانا', icon: 'whatsapp', path: '/', fragment: 'contact' },
  ];
}
