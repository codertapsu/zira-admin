import { Routes } from '@angular/router';

export const ERROR_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./errors.component').then((m) => m.ErrorsComponent),
  },
];
