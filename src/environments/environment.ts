/**
 * Production environment (the default that code imports). The `development`
 * build configuration swaps this file for `environment.development.ts`.
 *
 * zira-admin is served from a Firebase origin and talks to the gateway at
 * zira.top. The API base includes the `/api/v1` version prefix.
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://zira.top/api/v1',
};
