import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';

/**
 * Authenticated layout: a desktop-first sidebar + top bar that collapses to a
 * drawer on narrow screens, with the routed feature in the content area.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="shell" [class.shell--nav-open]="navOpen()">
      <aside class="shell__sidebar">
        <div class="shell__brand">Zira <span>Admin</span></div>
        <nav class="shell__nav">
          <a
            class="shell__nav-link"
            routerLink="/users"
            routerLinkActive="is-active"
            (click)="closeNav()"
          >
            Users
          </a>
        </nav>
        <p class="shell__nav-hint">More management surfaces coming soon.</p>
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
  `,
})
export class ShellComponent {
  private readonly _auth = inject(AuthService);

  protected readonly navOpen = signal<boolean>(false);

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
