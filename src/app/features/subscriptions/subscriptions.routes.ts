import { Routes } from '@angular/router';

export const SUBSCRIPTION_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./subscriptions-shell.component').then((m) => m.SubscriptionsShellComponent),
    children: [
      { path: '', redirectTo: 'plans', pathMatch: 'full' },
      {
        path: 'plans',
        loadComponent: () => import('./plans-list.component').then((m) => m.PlansListComponent),
      },
      {
        path: 'plans/new',
        loadComponent: () => import('./plan-form.component').then((m) => m.PlanFormComponent),
      },
      {
        path: 'plans/:id/edit',
        loadComponent: () => import('./plan-form.component').then((m) => m.PlanFormComponent),
      },
      {
        path: 'requests',
        loadComponent: () =>
          import('./requests-list.component').then((m) => m.RequestsListComponent),
      },
      {
        path: 'promo-codes',
        loadComponent: () =>
          import('./promo-codes-list.component').then((m) => m.PromoCodesListComponent),
      },
      {
        path: 'promo-codes/new',
        loadComponent: () =>
          import('./promo-code-form.component').then((m) => m.PromoCodeFormComponent),
      },
      {
        path: 'promo-codes/:id/edit',
        loadComponent: () =>
          import('./promo-code-form.component').then((m) => m.PromoCodeFormComponent),
      },
    ],
  },
];
