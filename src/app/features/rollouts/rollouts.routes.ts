import { Routes } from '@angular/router';

export const ROLLOUT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./rollouts.component').then((m) => m.RolloutsComponent),
  },
];
