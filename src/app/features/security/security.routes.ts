import { Routes } from '@angular/router';

export const SECURITY_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./security.component').then((m) => m.SecurityComponent),
  },
];
