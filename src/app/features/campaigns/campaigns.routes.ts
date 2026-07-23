import { Routes } from '@angular/router';

export const CAMPAIGN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./campaigns-list.component').then((m) => m.CampaignsListComponent),
  },
  {
    path: 'new',
    loadComponent: () => import('./campaign-form.component').then((m) => m.CampaignFormComponent),
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./campaign-form.component').then((m) => m.CampaignFormComponent),
  },
  {
    path: ':id/engagement',
    loadComponent: () =>
      import('./campaign-engagement.component').then((m) => m.CampaignEngagementComponent),
  },
];
