import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { ConnectComponent } from './features/connect/connect.component';
import { ShellComponent } from './features/shell/shell.component';

export const routes: Routes = [
  { path: 'connect', component: ConnectComponent },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'users' },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/users/users.component').then((m) => m.UsersComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
