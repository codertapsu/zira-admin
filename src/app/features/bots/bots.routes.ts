import { Routes } from '@angular/router';

export const BOT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./bots.component').then((m) => m.BotsComponent),
  },
];
