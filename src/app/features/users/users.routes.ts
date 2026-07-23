import { Routes } from '@angular/router';

export const USER_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./users.component').then((m) => m.UsersComponent),
  },
  {
    path: ':id',
    loadComponent: () => import('./user-detail.component').then((m) => m.UserDetailComponent),
  },
];
