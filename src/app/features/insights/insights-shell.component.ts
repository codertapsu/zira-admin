import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-insights-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Insights</h1>
      </header>

      <nav class="tabs" aria-label="Insights sections">
        <a class="tab" routerLink="productivity" routerLinkActive="is-active">Productivity</a>
        <a class="tab" routerLink="adoption" routerLinkActive="is-active">Adoption</a>
        <a class="tab" routerLink="funnel" routerLinkActive="is-active">Funnel</a>
        <a class="tab" routerLink="cohorts" routerLinkActive="is-active">Cohorts</a>
        <a class="tab" routerLink="notifications" routerLinkActive="is-active">Notifications</a>
      </nav>

      <router-outlet />
    </section>
  `,
})
export class InsightsShellComponent {}
