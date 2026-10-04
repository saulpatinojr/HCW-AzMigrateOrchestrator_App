import type { NormalizedResource, FieldProvenance } from "@amo/domain";
import { ARM_SCOPE, type TokenCredential } from "@amo/azure-auth";
import type { DiscoveryProvider, DiscoveryResult, DiscoveryScope } from "@amo/azure-discovery";

/**
 * Azure Resource Graph discovery over the REST API (ADR-0022). Read-only; pages with $skipToken; redacts nothing
 * because ARG returns no secrets — but tags are the only free-text field and are passed through unchanged.
 */
export interface ArgRow {
  id: string; name: string; type: string; location: string; resourceGroup: string; subscriptionId: string;
  kind?: string | null; sku?: { name?: string; tier?: string } | null; tags?: Record<string, string> | null;
}

const QUERY = "Resources | project id, name, type, location, resourceGroup, subscriptionId, kind, sku, tags | order by id asc";

export class ResourceGraphDiscoveryProvider implements DiscoveryProvider {
  readonly name = "azure-resource-graph";
  readonly authenticated = true;
  constructor(private readonly credential: TokenCredential, private readonly fetchImpl: typeof fetch = fetch, private readonly armBase = "https://management.azure.com") {}

  async discover(scope: DiscoveryScope): Promise<DiscoveryResult> {
    const { token } = await this.credential.getToken(ARM_SCOPE);
    const rows: ArgRow[] = [];
    const partial: string[] = [];
    const gaps: string[] = [];
    let skipToken: string | undefined;
    do {
      const body: Record<string, unknown> = { query: QUERY, options: { resultFormat: "objectArray", $top: 1000, ...(skipToken ? { $skipToken: skipToken } : {}) } };
      if (scope.kind === "subscription") body.subscriptions = [scope.id];
      if (scope.kind === "management-group") body.managementGroups = [scope.id];
      if (scope.kind === "resource-group") { body.subscriptions = [scope.id.split("/")[2]]; body.query = `${QUERY.replace("| order", `| where resourceGroup =~ '${scope.id.split("/")[4]}' | order`)}`; }
      const res = await this.fetchImpl(`${this.armBase}/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 403) { gaps.push(`Reader role missing on ${scope.kind} ${scope.id}`); break; }
      if (!res.ok) throw new Error(`Resource Graph query failed: ${res.status}`);
      const j = (await res.json()) as { data: ArgRow[]; $skipToken?: string; resultTruncated?: string };
      rows.push(...j.data);
      skipToken = j.$skipToken;
      if (j.resultTruncated === "true") partial.push("Resource Graph truncated results; some resources were not returned");
    } while (skipToken);
    return { resources: rows.map(toNormalized), partialVisibility: partial, permissionGaps: gaps, retrievedAt: new Date().toISOString() };
  }
}

export function toNormalized(r: ArgRow): NormalizedResource {
  const prov = (h: string, v: string | null): FieldProvenance => ({ normalizedHeader: h, normalizedValue: v, transformation: "resource-graph", evidence: v === null ? "missing" : "observed-from-azure-api" });
  const sku = r.sku?.name ?? r.sku?.tier ?? null;
  return {
    key: r.id.toLowerCase(),
    resourceId: r.id,
    name: r.name,
    type: r.type,
    provider: r.type.split("/")[0],
    resourceGroup: r.resourceGroup,
    location: r.location,
    subscriptionName: null,
    subscriptionId: r.subscriptionId,
    kind: r.kind ?? null,
    sku,
    status: null,
    tags: r.tags ?? {},
    parsedId: parse(r.id, r.type, r.name, r.resourceGroup, r.subscriptionId),
    provenance: [prov("name", r.name), prov("type", r.type), prov("location", r.location), prov("resourceGroup", r.resourceGroup), prov("subscriptionId", r.subscriptionId), prov("kind", r.kind ?? null), prov("sku", sku), prov("tags", r.tags ? JSON.stringify(r.tags) : null)],
    warnings: [],
    sourceRow: 0,
  };
}

function parse(id: string, type: string, name: string, rg: string, sub: string): NormalizedResource["parsedId"] {
  const segs = id.split("/").filter(Boolean);
  const provIdx = segs.findIndex((s) => s.toLowerCase() === "providers");
  const parentId = type.split("/").length > 2 ? "/" + segs.slice(0, provIdx + 2 + (type.split("/").length - 2) * 2).join("/") : undefined;
  return { valid: true, issues: [], subscriptionId: sub, resourceGroup: rg, provider: type.split("/")[0], typePath: type.split("/").slice(1).join("/"), fullType: type, name, parentId };
}
