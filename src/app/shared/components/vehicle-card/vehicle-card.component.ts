import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FavoritesService } from '../../../core/services/favorites.service';
import { Vehicle } from '../../../core/models/vehicle.model';
import { EgpPricePipe } from '../../pipes/egp-price.pipe';
import { CloudImageComponent } from '../cloud-image/cloud-image.component';
import { IconComponent } from '../icon/icon.component';

/** Storyboard panels 01 and 02. */
@Component({
  selector: 'app-vehicle-card',
  imports: [RouterLink, CloudImageComponent, IconComponent, EgpPricePipe],
  templateUrl: './vehicle-card.component.html',
  styleUrl: './vehicle-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class VehicleCardComponent {
  private readonly favorites = inject(FavoritesService);

  readonly vehicle = input.required<Vehicle>();

  /**
   * Matches the grid: 1 column on mobile through 5 on a wide desktop. Without
   * this the browser downloads a full-width image for a 20vw slot.
   */
  readonly sizes = input(
    '(min-width: 1536px) 20vw, (min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw',
  );

  /** Set on the one card that is the page's LCP candidate. */
  readonly priority = input(false);

  /** Set on the rest of the first row, so they are not deprioritised. */
  readonly eager = input(false);

  protected readonly title = computed(() =>
    `${this.vehicle().brand} ${this.vehicle().model}`.trim(),
  );

  protected readonly isReserved = computed(() => this.vehicle().status === 'reserved');

  protected readonly isSaved = computed(() => this.favorites.has(this.vehicle().id));

  protected toggleFavorite(event: Event): void {
    // The whole card is a link; the heart must not navigate.
    event.preventDefault();
    event.stopPropagation();
    this.favorites.toggle(this.vehicle().id);
  }
}
