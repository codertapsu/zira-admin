import { Routes } from '@angular/router';

export const FEEDBACK_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./feedback-list.component').then((m) => m.FeedbackListComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./feedback-detail.component').then((m) => m.FeedbackDetailComponent),
  },
];
