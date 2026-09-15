import { Routes } from '@angular/router';
import { HomeComponent } from './features/public/home/home.component';
import { PublicLayoutComponent } from './layouts/public-layout/public-layout.component';
import { PlaceholderPageComponent } from './shared/components/placeholder-page/placeholder-page.component';

/**
 * Public routes render inside `public-layout`; the admin area is lazy-loaded
 * and brings its own layout.
 *
 * TODO(features): every `PlaceholderPageComponent` below is a stub. Each one
 * is replaced by its real page in a later increment.
 */
export const routes: Routes = [
  {
    path: '',
    component: PublicLayoutComponent,
    children: [
      { path: '', component: HomeComponent, data: { title: 'الرئيسية' } },
      { path: 'vehicles', component: PlaceholderPageComponent, data: { title: 'جميع العربيات' } },
      {
        path: 'vehicles/:id',
        component: PlaceholderPageComponent,
        data: { title: 'تفاصيل العربية' },
      },
      { path: 'favorites', component: PlaceholderPageComponent, data: { title: 'المفضلة' } },
    ],
  },
  {
    path: 'admin',
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
