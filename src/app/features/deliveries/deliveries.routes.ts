import { Routes } from '@angular/router';

export const DELIVERIES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./deliveries.component').then((m) => m.DeliveriesComponent),
  },
];
