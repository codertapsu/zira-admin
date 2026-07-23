import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { ConfirmComponent } from '../../core/ui/confirm.component';
import { ToastsComponent } from '../../core/ui/toasts.component';

interface NavItem {
  readonly label: string;
  readonly path: string;
}

interface NavGroup {
  readonly title: string;
  readonly items: readonly NavItem[];
}

/**
 * Authenticated layout: a desktop-first grouped sidebar + top bar that collapses
 * to a drawer on narrow screens, the routed feature in the content area, and the
 * app-wide toast + confirm hosts.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ToastsComponent, ConfirmComponent],
  template: `
    <div class="shell" [class.shell--nav-open]="navOpen()">
      <aside class="shell__sidebar">
        <div class="shell__brand">Zira <span>Admin</span></div>
        <nav class="shell__nav">
          @for (group of navGroups; track group.title) {
            <div class="shell__nav-group">
              <span class="shell__nav-group-title">{{ group.title }}</span>
              @for (item of group.items; track item.path) {
                <a
                  class="shell__nav-link"
                  [routerLink]="item.path"
                  routerLinkActive="is-active"
                  (click)="closeNav()"
                >
                  {{ item.label }}
                </a>
              }
            </div>
          }
        </nav>
      </aside>

      <button
        class="shell__scrim"
        type="button"
        aria-label="Close menu"
        (click)="closeNav()"
      ></button>

      <div class="shell__main">
        <header class="shell__topbar">
          <button
            class="btn btn--icon shell__menu-btn"
            type="button"
            aria-label="Toggle menu"
            (click)="toggleNav()"
          >
            ☰
          </button>
          <span class="shell__topbar-title">Operations console</span>
          <button class="btn btn--ghost btn--sm" type="button" (click)="logout()">Sign out</button>
        </header>

        <main class="shell__content">
          <router-outlet />
        </main>
      </div>
    </div>

    <app-toasts />
    <app-confirm />
  `,
})
export class ShellComponent {
  private readonly _auth = inject(AuthService);

  protected readonly navOpen = signal<boolean>(false);

  protected readonly navGroups: readonly NavGroup[] = [
    { title: 'Engagement', items: [{ label: 'Campaigns', path: '/campaigns' }] },
    {
      title: 'People',
      items: [
        { label: 'Users', path: '/users' },
        { label: 'Feedback', path: '/feedback' },
      ],
    },
    { title: 'Billing', items: [{ label: 'Subscriptions', path: '/subscriptions' }] },
    {
      title: 'System',
      items: [
        { label: 'Settings', path: '/system-settings' },
        { label: 'Insights', path: '/insights' },
      ],
    },
  ];

  protected toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  protected closeNav(): void {
    this.navOpen.set(false);
  }

  protected logout(): void {
    this._auth.logout();
  }
}
