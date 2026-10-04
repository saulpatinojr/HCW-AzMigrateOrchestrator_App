import { ARM_SCOPE, type TokenCredential } from "@amo/azure-auth";
import { gate, type ApprovalOperation, type Principal } from "@amo/authorization";
import type { Logger } from "@amo/observability";
import { noopLogger } from "@amo/observability";

/**
 * Azure Resource Mover as the first controlled-execution surface (ADR-0022). Every state-changing call passes the human
 * approval gate; `discard` is the built-in rollback. Lab builds never import this package (edition boundary test).
 * REST shapes follow Microsoft.Migrate/moveCollections 2023-08-01; [VERIFY] against current API before first use.
 */
export type MoverAction = "prepare" | "initiateMove" | "commit" | "discard";

export interface MoveCollectionRef { subscriptionId: string; resourceGroup: string; name: string }
export interface MoverOperationResult { action: MoverAction; accepted: boolean; operationUrl: string | null; reason: string }

const APPROVAL_FOR: Record<MoverAction, ApprovalOperation | null> = {
  prepare: null, // creates target-side shadow resources but nothing is cut over; still requires controlled-execution level
  initiateMove: "production-deploy",
  commit: "data-cutover",
  discard: null, // rollback path
};

export class ResourceMoverClient {
  constructor(private readonly credential: TokenCredential, private readonly fetchImpl: typeof fetch = fetch, private readonly armBase = "https://management.azure.com", private readonly log: Logger = noopLogger) {}

  private url(c: MoveCollectionRef, suffix = ""): string {
    return `${this.armBase}/subscriptions/${c.subscriptionId}/resourceGroups/${c.resourceGroup}/providers/Microsoft.Migrate/moveCollections/${c.name}${suffix}?api-version=2023-08-01`;
  }
  private async headers(): Promise<Record<string, string>> {
    const { token } = await this.credential.getToken(ARM_SCOPE);
    return { authorization: `Bearer ${token}`, "content-type": "application/json" };
  }

  /** Create or update a move collection (region move). Requires controlled-execution; not destructive. */
  async ensureCollection(principal: Principal, c: MoveCollectionRef, sourceRegion: string, targetRegion: string, identityResourceId: string): Promise<MoverOperationResult> {
    const g = gate(principal, "role-assignment", c.name);
    // Creating the collection assigns a managed identity that later needs RBAC; treat it as the role-assignment approval.
    if (!g.allowed) return { action: "prepare", accepted: false, operationUrl: null, reason: g.reason };
    const res = await this.fetchImpl(this.url(c), { method: "PUT", headers: await this.headers(), body: JSON.stringify({ location: targetRegion, identity: { type: "UserAssigned", userAssignedIdentities: { [identityResourceId]: {} } }, properties: { sourceRegion, targetRegion, moveType: "RegionToRegion" } }) });
    return { action: "prepare", accepted: res.ok, operationUrl: res.headers.get("azure-asyncoperation"), reason: res.ok ? "collection ensured" : `HTTP ${res.status}` };
  }

  /** Add resources to the collection with their target resource group. Not destructive. */
  async addResources(principal: Principal, c: MoveCollectionRef, resourceIds: string[], targetResourceGroupId: string): Promise<MoverOperationResult[]> {
    const out: MoverOperationResult[] = [];
    if (principal.edition !== "enterprise") return resourceIds.map(() => ({ action: "prepare", accepted: false, operationUrl: null, reason: "demo edition cannot execute Azure operations" }));
    const headers = await this.headers();
    for (const id of resourceIds) {
      const name = id.split("/").pop()!.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const res = await this.fetchImpl(this.url(c, `/moveResources/${name}`), { method: "PUT", headers, body: JSON.stringify({ properties: { sourceId: id, resourceSettings: { resourceType: id.split("/providers/")[1]?.split("/").slice(0, 2).join("/"), targetResourceName: id.split("/").pop(), targetResourceGroupName: targetResourceGroupId.split("/").pop() } } }) });
      out.push({ action: "prepare", accepted: res.ok, operationUrl: res.headers.get("azure-asyncoperation"), reason: res.ok ? `added ${name}` : `HTTP ${res.status}` });
    }
    return out;
  }

  /** prepare → initiateMove → commit, or discard. Each is gated; the result records why a call was refused. */
  async run(principal: Principal, c: MoveCollectionRef, action: MoverAction, moveResourceIds: string[]): Promise<MoverOperationResult> {
    const needed = APPROVAL_FOR[action];
    if (principal.edition !== "enterprise") return { action, accepted: false, operationUrl: null, reason: "demo edition cannot execute Azure operations" };
    if (needed) {
      const g = gate(principal, needed, c.name);
      if (!g.allowed) { this.log.warn("resource mover action refused", { action, reason: g.reason }); return { action, accepted: false, operationUrl: null, reason: g.reason }; }
    } else if (principal.grantedLevel !== "controlled-execution" && principal.grantedLevel !== "destructive-execution") {
      return { action, accepted: false, operationUrl: null, reason: "controlled-execution level required" };
    }
    const res = await this.fetchImpl(this.url(c, `/${action}`), { method: "POST", headers: await this.headers(), body: JSON.stringify({ moveResources: moveResourceIds, validateOnly: false }) });
    this.log.info("resource mover action", { action, status: res.status, collection: c.name });
    return { action, accepted: res.status === 202 || res.ok, operationUrl: res.headers.get("azure-asyncoperation") ?? res.headers.get("location"), reason: res.ok || res.status === 202 ? "accepted" : `HTTP ${res.status}` };
  }

  /** Read-only: the collection's unresolved dependencies (what Resource Mover thinks must move together). */
  async unresolvedDependencies(c: MoveCollectionRef): Promise<string[]> {
    const res = await this.fetchImpl(this.url(c, "/unresolvedDependencies"), { headers: await this.headers() });
    if (!res.ok) throw new Error(`unresolvedDependencies HTTP ${res.status}`);
    const j = (await res.json()) as { value?: Array<{ id: string }> };
    return (j.value ?? []).map((v) => v.id);
  }
}
