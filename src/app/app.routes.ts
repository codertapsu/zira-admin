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
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      {
        path: 'overview',
        loadChildren: () =>
          import('./features/overview/overview.routes').then((m) => m.OVERVIEW_ROUTES),
      },
      {
        path: 'campaigns',
        loadChildren: () =>
          import('./features/campaigns/campaigns.routes').then((m) => m.CAMPAIGN_ROUTES),
      },
      {
        path: 'users',
        loadChildren: () => import('./features/users/users.routes').then((m) => m.USER_ROUTES),
      },
      {
        path: 'feedback',
        loadChildren: () =>
          import('./features/feedback/feedback.routes').then((m) => m.FEEDBACK_ROUTES),
      },
      {
        path: 'subscriptions',
        loadChildren: () =>
          import('./features/subscriptions/subscriptions.routes').then(
            (m) => m.SUBSCRIPTION_ROUTES,
          ),
      },
      {
        path: 'system-settings',
        loadChildren: () =>
          import('./features/system-settings/system-settings.routes').then(
            (m) => m.SYSTEM_SETTINGS_ROUTES,
          ),
      },
      {
        path: 'insights',
        loadChildren: () =>
          import('./features/insights/insights.routes').then((m) => m.INSIGHTS_ROUTES),
      },
      {
        path: 'errors',
        loadChildren: () => import('./features/errors/errors.routes').then((m) => m.ERROR_ROUTES),
      },
      {
        path: 'deliveries',
        loadChildren: () =>
          import('./features/deliveries/deliveries.routes').then((m) => m.DELIVERIES_ROUTES),
      },
      {
        path: 'bots',
        loadChildren: () => import('./features/bots/bots.routes').then((m) => m.BOT_ROUTES),
      },
      {
        path: 'security',
        loadChildren: () =>
          import('./features/security/security.routes').then((m) => m.SECURITY_ROUTES),
      },
      {
        path: 'audit',
        loadChildren: () => import('./features/audit/audit.routes').then((m) => m.AUDIT_ROUTES),
      },
      {
        path: 'support',
        loadChildren: () =>
          import('./features/support/support.routes').then((m) => m.SUPPORT_ROUTES),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
