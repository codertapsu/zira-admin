import { Routes } from '@angular/router';

export const OVERVIEW_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./overview.component').then((m) => m.OverviewComponent),
  },
];
