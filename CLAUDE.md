# Zira Admin

## Product context

`zira-admin` is an **internal, browser-only operations console for Zira admins and staff**.
It is a Firebase-hosted Angular SPA that talks to the Zira gateway API at `zira.top` using a
**bearer session** (no cookies — it's a different origin from the gateway).

Who uses it: the Zira team (`Role.Admin` / `Role.Staff`), not end users. It is
`noindex, nofollow` (`src/index.html` + `X-Robots-Tag` in `firebase.json`).

### Place among the Zira repos

- `zira-client` — Angular SPA (Zalo/Telegram Mini App), served under `/app/`.
- `zira-server` — NestJS gateway + `zalo-bot`. Owns all Zira data and every admin endpoint.
- `zira-landing` — Next.js marketing site at the origin root.
- `zira-bot-console` — static Telegram-bot ops console on Firebase (no Zira backend).
- `zira-admin` — **this repo**. Static Angular app on Firebase Hosting that DOES call the
  Zira gateway (authenticated) to manage users, subscriptions, campaigns, etc.

There are **no shared packages** across repos — do not add a dependency on the others. The
API contract is the source of truth; mirror shapes in `src/app/core/api/models.ts`.

## Login (one-time admin code)

There is no password. An Admin/Staff user generates a **one-time login code** in zira-client
(Profile → "Admin console login code"), then pastes it into this console's connect screen.

- `POST /auth/admin-login/codes/exchange { code }` → returns a raw bearer `TokenPair`
  (server: `apps/api-gateway/src/modules/auth/controllers/admin-login-code.controller.ts`).
- Tokens live in memory + `localStorage` (`TokenStoreService`); the interceptor attaches
  `Authorization: Bearer` and rotates via `POST /auth/refresh` (with `x-refresh-token`) on 401.
- The server re-checks Admin/Staff + not-deactivated at redeem time, and every admin endpoint
  is `@Roles(Role.Admin, Role.Staff)` — the client `authGuard` is UX only. Kill-switch:
  `admin_login.enabled` system setting.

## Repo structure

Single Angular application (no `projects/` monorepo). Mirrors `zira-bot-console`'s toolchain.

- `src/main.ts` — `bootstrapApplication(App, appConfig)`.
- `src/app/app.config.ts` — providers: global error listeners + `provideHttpClient(withInterceptors([authInterceptor]))` + `provideRouter(routes)`. (Unlike bot-console, this app IS an authenticated API client.)
- `src/app/app.routes.ts` — `/connect` (public) + a guarded `ShellComponent` with lazy feature children.
- `src/app/core/auth/` — `TokenStoreService`, `AuthService`, `authInterceptor`, `authGuard`.
- `src/app/core/api/models.ts` — API envelope + response shapes mirrored from the gateway.
- `src/app/features/connect/` — the OTP sign-in screen.
- `src/app/features/shell/` — authenticated layout (responsive sidebar + top bar + outlet).
- `src/app/features/users/` — Users management vertical (search / deactivate / reactivate).
- `src/styles.scss` — the whole design system (CSS custom properties + global classes, light/dark).
- `src/environments/` — `environment.ts` (prod, `zira.top`) + `environment.development.ts` (local gateway).

## Angular conventions

Angular **22** / TypeScript **6.0.3** (exact pins, `package.json`). Verify versions before applying
version-specific guidance.

- **Zoneless + standalone.** No `zone.js`, no `NgModule`. Components declare deps in `imports`.
  Do **not** write `standalone: true` (it's the default).
- **Signals for state**, `inject()` for DI, `input()`/`output()` where needed. Fields `readonly`.
- **Built-in control flow** (`@if` / `@for` / `@switch`). No `*ngIf`/`*ngFor`.
- **Inline templates** on components (mirrors bot-console); all CSS lives in `src/styles.scss`
  (no per-component stylesheets — the `anyComponentStyle` budget is 4kB/8kB but nothing uses it).
- **Template-driven forms with signal models**: bind `[ngModel]="sig()" (ngModelChange)="sig.set($event)"`.
- `noPropertyAccessFromIndexSignature` is on — bracket-access index-signature properties.
- All network access goes through a `core` service that calls the gateway; features never `fetch`.
- New management surface = a new `features/<area>/` + a lazy route child under the shell.
  Extend the sidebar nav in `ShellComponent`.

## Styling

Plain CSS in one `src/styles.scss` — CSS custom properties on `:root`, dark mode via a single
`@media (prefers-color-scheme: dark)` block that re-declares the same variables. Reuse the global
classes (`.card`, `.btn` + `--primary`/`--ghost`/`--danger`/`--sm`/`--block`/`--icon`, `.input`,
`.field`, `.badge` + `--ok`/`--muted`, `.table`, `.state`, `.spinner`, the `.shell__*` layout, the
`.page__*` helpers) before inventing new styles. Any new colour must be declared in **both** the
light and dark blocks. Colours are chosen for this tool and are NOT synced with zira-client.

## Deployment (Firebase Hosting)

- Firebase project **`zira-7439c`** — shared with `zira-landing` (default site) and
  `zira-bot-console` (site `zira-7439c-3425d`). This console deploys to its **own additional site**.
- **One-time setup (a human runs this):**
  1. `firebase hosting:sites:create <site-id>` (e.g. `zira-admin`).
  2. `firebase target:apply hosting admin <site-id>`.
  3. Update `.firebaserc` `targets.zira-7439c.hosting.admin` to the real `<site-id>` if it differs
     from the placeholder `zira-admin`.
  4. Add the deployed origin (`https://<site-id>.web.app`) to the gateway's `CORS_ORIGINS`
     (server-owned `.env`), or the browser calls are blocked by CORS.
- Build: `npm run build` → `dist/zira-admin/browser`. Deploy: `firebase deploy --only hosting:admin`.
- `firebase.json` rewrites `**` → `/index.html` (SPA) and sets security headers. **The CSP is the
  real boundary**: `connect-src 'self' https://zira.top`. Any new API origin, CDN, font host, or SDK
  is blocked at runtime until `firebase.json` is updated — a deliberate decision, not a drive-by edit.
- No GA4 / Firebase SDK — hosting only, matching bot-console.

## Local development

- `npm start` → `ng serve` on **http://localhost:4300** (4200 is taken by zira-client).
- Point `src/environments/environment.development.ts` `apiBaseUrl` at your local gateway
  (default `http://localhost:3000/api/v1`), and add `http://localhost:4300` to the gateway's
  `CORS_ORIGINS` so the browser calls succeed.
- Get a login code from a running zira-client (Admin/Staff account) and paste it into `/connect`.

## Verification

`package.json` scripts: `ng`, `start`, `build`, `watch`. No lint or test setup yet.

- `npm run build` — the real gate, and the same command CI runs (`.github/workflows/admin-ci.yml`,
  Node 24.18.0 + npm 12). Production budgets: initial 500kB warn / 1MB error.
- `npm start` — manual verification against a real gateway + a real login code.
- `npx prettier --check <file>` on files you touch.

If you add tests, add the runner, the `test` target, and a CI step together.

## Avoid

- Do not add a backend, proxy, Firebase SDK/Firestore/Functions, or analytics — hosting only.
- Do not add `zone.js`, `NgModule`s, per-component stylesheets, Tailwind, or a UI framework.
- Do not widen the CSP `connect-src` casually — check `firebase.json` first.
- Do not import from or make contract assumptions about the other Zira repos beyond the HTTP API.
- Do not read or modify `.env` files, and never commit tokens or Firebase service-account keys
  (`/.firebase/` is gitignored — keep it that way).

## AI agent setup

- `CLAUDE.md` is the canonical project memory for Claude Code.
- `AGENTS.md` is the entry point for OpenAI/Codex-style agents and must stay aligned with this file.
  When a project-wide rule changes, update both in the same commit.
