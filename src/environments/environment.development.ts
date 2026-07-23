/**
 * Local development environment. Point `apiBaseUrl` at your local gateway.
 * The gateway's CORS_ORIGINS must include this dev server origin
 * (http://localhost:4300 — see `npm start`) for browser calls to succeed.
 */
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000/api/v1',
};
