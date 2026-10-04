import { PublicClientApplication, InteractionRequiredAuthError, type AccountInfo } from "@azure/msal-browser";
import { config } from "./config.js";

/** MSAL public client: authorization-code flow with PKCE; tokens in session storage; no client secret exists. */
export const msal = new PublicClientApplication({
  auth: { clientId: config.clientId, authority: `https://login.microsoftonline.com/${config.tenantId}`, redirectUri: window.location.origin },
  cache: { cacheLocation: "sessionStorage" },
});
export const ready = msal.initialize().then(() => msal.handleRedirectPromise()).then((r) => { if (r?.account) msal.setActiveAccount(r.account); });

export function account(): AccountInfo | null { return msal.getActiveAccount() ?? msal.getAllAccounts()[0] ?? null; }
export async function signIn(): Promise<void> { await msal.loginRedirect({ scopes: [config.apiScope] }); }
export async function signOut(): Promise<void> { await msal.logoutRedirect(); }
export async function apiToken(): Promise<string> {
  const acc = account();
  if (!acc) throw new Error("not signed in");
  try {
    return (await msal.acquireTokenSilent({ scopes: [config.apiScope], account: acc })).accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) { await msal.acquireTokenRedirect({ scopes: [config.apiScope] }); }
    throw e;
  }
}
