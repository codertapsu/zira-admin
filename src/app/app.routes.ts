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
      { path: '', pathMatch: 'full', redirectTo: 'campaigns' },
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
    ],
  },
  { path: '**', redirectTo: '' },
];
