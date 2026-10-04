import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

/**
 * Token credentials for the appliance (ADR-0022). Dependency-free implementations of the three credential kinds the
 * product allows: Azure CLI (developer), managed identity (hosted in Azure), workload identity federation (CI/automation).
 * Client secrets are deliberately not implemented.
 */
export interface AccessToken {
  token: string;
  expiresOn: number; // epoch ms
}
export interface TokenCredential {
  readonly kind: "azure-cli" | "managed-identity" | "workload-identity-federation" | "static-test";
  getToken(scope: string): Promise<AccessToken>;
}

export const ARM_SCOPE = "https://management.azure.com/.default";

export class AzureCliCredential implements TokenCredential {
  readonly kind = "azure-cli";
  constructor(private readonly exec = promisify(execFile)) {}
  async getToken(scope: string): Promise<AccessToken> {
    const resource = scope.replace(/\/\.default$/, "");
    const { stdout } = await this.exec("az", ["account", "get-access-token", "--resource", resource, "--output", "json"]);
    const j = JSON.parse(stdout) as { accessToken: string; expires_on?: string; expiresOn?: string };
    const exp = j.expires_on ? Number(j.expires_on) * 1000 : j.expiresOn ? Date.parse(j.expiresOn) : Date.now() + 3600_000;
    return { token: j.accessToken, expiresOn: exp };
  }
}

export class ManagedIdentityCredential implements TokenCredential {
  readonly kind = "managed-identity";
  constructor(private readonly clientId?: string, private readonly fetchImpl: typeof fetch = fetch, private readonly env: NodeJS.ProcessEnv = process.env) {}
  async getToken(scope: string): Promise<AccessToken> {
    const resource = scope.replace(/\/\.default$/, "");
    // Container Apps / App Service expose IDENTITY_ENDPOINT + IDENTITY_HEADER; VMs use IMDS.
    const endpoint = this.env.IDENTITY_ENDPOINT;
    const url = endpoint
      ? `${endpoint}?api-version=2019-08-01&resource=${encodeURIComponent(resource)}${this.clientId ? `&client_id=${this.clientId}` : ""}`
      : `http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=${encodeURIComponent(resource)}${this.clientId ? `&client_id=${this.clientId}` : ""}`;
    const headers: Record<string, string> = endpoint ? { "X-IDENTITY-HEADER": this.env.IDENTITY_HEADER ?? "" } : { Metadata: "true" };
    const res = await this.fetchImpl(url, { headers });
    if (!res.ok) throw new Error(`managed identity token request failed: ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_on: string | number };
    return { token: j.access_token, expiresOn: Number(j.expires_on) * 1000 };
  }
}

export class WorkloadIdentityCredential implements TokenCredential {
  readonly kind = "workload-identity-federation";
  constructor(private readonly tenantId: string, private readonly clientId: string, private readonly federatedTokenFile: string, private readonly fetchImpl: typeof fetch = fetch, private readonly authorityHost = "https://login.microsoftonline.com") {}
  async getToken(scope: string): Promise<AccessToken> {
    const assertion = (await readFile(this.federatedTokenFile, "utf8")).trim();
    const body = new URLSearchParams({ client_id: this.clientId, scope, grant_type: "client_credentials", client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer", client_assertion: assertion });
    const res = await this.fetchImpl(`${this.authorityHost}/${this.tenantId}/oauth2/v2.0/token`, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });
    if (!res.ok) throw new Error(`workload identity token request failed: ${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in: number };
    return { token: j.access_token, expiresOn: Date.now() + j.expires_in * 1000 };
  }
}

/** Test-only credential. */
export class StaticTokenCredential implements TokenCredential {
  readonly kind = "static-test";
  constructor(private readonly token = "test-token") {}
  async getToken(): Promise<AccessToken> { return { token: this.token, expiresOn: Date.now() + 3600_000 }; }
}

/** Caches tokens per scope until 2 minutes before expiry. */
export class CachingCredential implements TokenCredential {
  readonly kind: TokenCredential["kind"];
  private cache = new Map<string, AccessToken>();
  constructor(private readonly inner: TokenCredential, private readonly now: () => number = Date.now) { this.kind = inner.kind; }
  async getToken(scope: string): Promise<AccessToken> {
    const c = this.cache.get(scope);
    if (c && c.expiresOn - this.now() > 120_000) return c;
    const t = await this.inner.getToken(scope);
    this.cache.set(scope, t);
    return t;
  }
}

export function credentialFromEnv(env: NodeJS.ProcessEnv = process.env): TokenCredential {
  for (const k of Object.keys(env)) if (/^(AMO_|AZURE_).*(CLIENT_SECRET|PASSWORD)$/i.test(k)) throw new Error(`refusing ${k}: client secrets are not a supported credential; use managed identity or workload identity federation`);
  const kind = env.AMO_CREDENTIAL_KIND ?? "managed-identity";
  switch (kind) {
    case "azure-cli": return new CachingCredential(new AzureCliCredential());
    case "workload-identity-federation": {
      const file = env.AZURE_FEDERATED_TOKEN_FILE;
      if (!env.AZURE_TENANT_ID || !env.AZURE_CLIENT_ID || !file) throw new Error("workload identity federation requires AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_FEDERATED_TOKEN_FILE");
      return new CachingCredential(new WorkloadIdentityCredential(env.AZURE_TENANT_ID, env.AZURE_CLIENT_ID, file));
    }
    case "managed-identity": return new CachingCredential(new ManagedIdentityCredential(env.AZURE_CLIENT_ID));
    default: throw new Error(`unsupported AMO_CREDENTIAL_KIND ${kind}`);
  }
}
