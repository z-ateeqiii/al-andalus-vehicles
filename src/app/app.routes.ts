import { Routes } from '@angular/router';
import { FavoritesComponent } from './features/public/favorites/favorites.component';
import { HomeComponent } from './features/public/home/home.component';
import { VehicleDetailsComponent } from './features/public/vehicle-details/vehicle-details.component';
import { VehiclesComponent } from './features/public/vehicles/vehicles.component';
import { PublicLayoutComponent } from './layouts/public-layout/public-layout.component';

/**
 * Public routes render inside `public-layout`; the admin area is lazy-loaded
 * and brings its own layout.
 */
export const routes: Routes = [
  {
    path: '',
    component: PublicLayoutComponent,
    children: [
      { path: '', component: HomeComponent, data: { title: 'الرئيسية' } },
      { path: 'vehicles', component: VehiclesComponent, data: { title: 'جميع العربيات' } },
      {
        path: 'vehicles/:id',
        component: VehicleDetailsComponent,
        data: { title: 'تفاصيل العربية' },
      },
      { path: 'favorites', component: FavoritesComponent, data: { title: 'المفضلة' } },
    ],
  },
  {
    path: 'admin',
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
