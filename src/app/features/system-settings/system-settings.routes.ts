import { Routes } from '@angular/router';

export const SYSTEM_SETTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./system-settings.component').then((m) => m.SystemSettingsComponent),
  },
];
