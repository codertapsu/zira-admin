# Zira Admin

Internal, browser-only operations console for Zira **admins and staff**. A Firebase-hosted
Angular 22 SPA that calls the Zira gateway (`zira.top`) with a bearer session.

> There is no end-user data here beyond what the gateway's admin API exposes. Access requires an
> Admin/Staff account.

## Sign in

1. In the Zira app (zira-client), as an Admin/Staff user, open **Profile → Admin console login code**.
2. Copy the one-time code.
3. Paste it into this console's connect screen. It's exchanged for a bearer session.

## Develop

```bash
npm ci
npm start        # ng serve on http://localhost:4300
```

Point `src/environments/environment.development.ts` `apiBaseUrl` at your local gateway and add
`http://localhost:4300` to the gateway's `CORS_ORIGINS`.

## Build

```bash
npm run build    # → dist/zira-admin/browser
```

## Deploy (Firebase Hosting, project `zira-7439c`)

One-time setup (run by a human):

```bash
firebase hosting:sites:create <site-id>          # e.g. zira-admin
firebase target:apply hosting admin <site-id>    # update .firebaserc if the id differs
# add https://<site-id>.web.app to the gateway CORS_ORIGINS (.env)
```

Then:

```bash
firebase deploy --only hosting:admin
```

See `CLAUDE.md` for architecture, conventions, and the full deploy/CORS checklist.
