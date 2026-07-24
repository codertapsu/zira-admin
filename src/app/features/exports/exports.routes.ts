import { Routes } from '@angular/router';

export const EXPORT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./exports.component').then((m) => m.ExportsComponent),
  },
];
