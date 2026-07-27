import { Routes } from '@angular/router';

export const AI_USAGE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./ai-usage.component').then((m) => m.AiUsageComponent),
  },
];
