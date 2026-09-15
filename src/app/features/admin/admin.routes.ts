import { Routes } from '@angular/router';
import { adminGuard } from '../../core/guards/admin.guard';
import { AdminLayoutComponent } from '../../layouts/admin-layout/admin-layout.component';
import { PlaceholderPageComponent } from '../../shared/components/placeholder-page/placeholder-page.component';

/**
 * Lazy-loaded admin area. Login sits outside the layout — there is no sidebar
 * to show before signing in. There is no public sign-up route.
 *
 * TODO(features): replace every PlaceholderPageComponent with its real page.
 */
export const ADMIN_ROUTES: Routes = [
  {
    path: 'login',
    component: PlaceholderPageComponent,
    data: { title: 'تسجيل الدخول' },
  },
  {
    path: '',
    component: AdminLayoutComponent,
    canActivate: [adminGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        component: PlaceholderPageComponent,
        data: { title: 'لوحة التحكم' },
      },
      { path: 'vehicles', component: PlaceholderPageComponent, data: { title: 'العربيات' } },
      {
        path: 'vehicles/new',
        component: PlaceholderPageComponent,
        data: { title: 'ضيف عربية جديدة' },
      },
      {
        path: 'vehicles/edit/:id',
        component: PlaceholderPageComponent,
        data: { title: 'عدّل بيانات العربية' },
      },
      { path: 'settings', component: PlaceholderPageComponent, data: { title: 'الإعدادات' } },
    ],
  },
];
