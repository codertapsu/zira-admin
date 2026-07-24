import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-subscriptions-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <section class="page">
      <header class="page__head">
        <h1 class="page__title">Subscriptions</h1>
      </header>

      <nav class="tabs">
        <a class="tab" routerLink="plans" routerLinkActive="is-active">Plans</a>
        <a class="tab" routerLink="requests" routerLinkActive="is-active">Requests</a>
        <a class="tab" routerLink="promo-codes" routerLinkActive="is-active">Promo codes</a>
        <a class="tab" routerLink="subscribers" routerLinkActive="is-active">Subscribers</a>
        <a class="tab" routerLink="revenue" routerLinkActive="is-active">Revenue</a>
        <a class="tab" routerLink="decisions" routerLinkActive="is-active">Decisions</a>
      </nav>

      <router-outlet />
    </section>
  `,
})
export class SubscriptionsShellComponent {}
