import { Routes } from '@angular/router';

export const INSIGHTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./insights-shell.component').then((m) => m.InsightsShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'productivity' },
      {
        path: 'productivity',
        loadComponent: () =>
          import('./productivity-trend.component').then((m) => m.ProductivityTrendComponent),
      },
      {
        path: 'adoption',
        loadComponent: () =>
          import('./feature-adoption.component').then((m) => m.FeatureAdoptionComponent),
      },
      {
        path: 'funnel',
        loadComponent: () =>
          import('./activation-funnel.component').then((m) => m.ActivationFunnelComponent),
      },
      {
        path: 'cohorts',
        loadComponent: () => import('./cohorts.component').then((m) => m.CohortsComponent),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./notification-metrics.component').then((m) => m.NotificationMetricsComponent),
      },
    ],
  },
];
