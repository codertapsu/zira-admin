import { Routes } from '@angular/router';

export const INSIGHTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./insights.component').then((m) => m.InsightsComponent),
  },
];
