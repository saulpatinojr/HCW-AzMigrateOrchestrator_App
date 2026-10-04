import { ARM_SCOPE, type TokenCredential } from "@amo/azure-auth";

/**
 * Subscription inventory across the home tenant and Azure Lighthouse delegations (ADR-0025). Resource Graph projects
 * delegated subscriptions into the managing tenant; `tenantId` on each subscription tells us which directory owns it,
 * which is exactly what cross-tenant planning needs.
 */
export interface SubscriptionScope {
  subscriptionId: string;
  name: string;
  tenantId: string;
  /** true when the subscription belongs to a different directory than the caller (Lighthouse delegation). */
  delegated: boolean;
  managedBy: string | null;
}

export class ScopeInventory {
  constructor(private readonly credential: TokenCredential, private readonly homeTenantId: string, private readonly fetchImpl: typeof fetch = fetch, private readonly armBase = "https://management.azure.com") {}

  async listSubscriptions(): Promise<SubscriptionScope[]> {
    const { token } = await this.credential.getToken(ARM_SCOPE);
    const res = await this.fetchImpl(`${this.armBase}/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ query: "resourcecontainers | where type == 'microsoft.resources/subscriptions' | project subscriptionId, name, tenantId, managedBy | order by name asc", options: { resultFormat: "objectArray", $top: 1000 } }) });
    if (!res.ok) throw new Error(`subscription inventory failed: ${res.status}`);
    const j = (await res.json()) as { data: Array<{ subscriptionId: string; name: string; tenantId: string; managedBy?: string | null }> };
    return j.data.map((d) => ({ subscriptionId: d.subscriptionId, name: d.name, tenantId: d.tenantId, delegated: d.tenantId.toLowerCase() !== this.homeTenantId.toLowerCase(), managedBy: d.managedBy ?? null }));
  }

  /** Derive the tenant relationship for an intent from the two subscriptions involved. */
  static relationship(source: SubscriptionScope | undefined, destination: SubscriptionScope | undefined): { sameTenant: boolean | null; sameSubscription: boolean | null } {
    if (!source || !destination) return { sameTenant: null, sameSubscription: null };
    return { sameTenant: source.tenantId.toLowerCase() === destination.tenantId.toLowerCase(), sameSubscription: source.subscriptionId.toLowerCase() === destination.subscriptionId.toLowerCase() };
  }
}
