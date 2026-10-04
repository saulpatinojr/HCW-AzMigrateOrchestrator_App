/** Public configuration only (VITE_* is compiled into the bundle). No secrets: PKCE public client. */
export const config = {
  tenantId: import.meta.env.VITE_ENTRA_TENANT_ID as string,
  clientId: import.meta.env.VITE_ENTRA_SPA_CLIENT_ID as string, // the SPA app registration (public client)
  apiScope: import.meta.env.VITE_API_SCOPE as string,            // e.g. api://<api-client-id>/access_as_user
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string) ?? "",
};
