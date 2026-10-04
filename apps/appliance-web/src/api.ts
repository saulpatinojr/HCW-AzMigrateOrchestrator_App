import { apiToken } from "./auth.js";
import { config } from "./config.js";
import type { Assessment } from "@amo/domain";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers: { authorization: `Bearer ${await apiToken()}`, "content-type": "application/json", ...(init.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: { message: string } }).error?.message ?? `HTTP ${res.status}`);
  return body as T;
}
export const api = {
  me: () => call<{ oid: string; level: string; roles: string[] }>("/api/me"),
  scopes: () => call<{ homeTenantId: string; subscriptions: Array<{ subscriptionId: string; name: string; tenantId: string; delegated: boolean }>; delegatedCount: number }>("/api/scopes"),
  list: () => call<Array<{ id: string; createdAt: string; resourceCount: number; operation: string }>>("/api/assessments"),
  create: (scopeId: string, intent: Record<string, unknown>, destinationSubscriptionId?: string) => call<{ assessmentId: string }>("/api/assessments", { method: "POST", body: JSON.stringify({ scope: { kind: "subscription", id: scopeId }, intent, destinationSubscriptionId }) }),
  get: (id: string) => call<{ assessment: Assessment }>(`/api/assessments/${id}`),
  validateMove: (id: string, targetResourceGroupId: string) => call<{ results: Array<{ sourceResourceGroup: string; ok: boolean; errors: Array<{ code: string; message: string }> }> }>(`/api/assessments/${id}/validate-move`, { method: "POST", body: JSON.stringify({ targetResourceGroupId }) }),
  approve: (operation: string, targetKey: string, note: string) => call<{ id: string }>("/api/approvals", { method: "POST", body: JSON.stringify({ operation, targetKey, note }) }),
  mover: (action: string, collection: { subscriptionId: string; resourceGroup: string; name: string }, moveResourceIds: string[]) => fetch(`${config.apiBaseUrl}/api/execution/resource-mover/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ collection, moveResourceIds }) }).then(async (r) => ({ status: r.status, ...(await r.json()) })) as Promise<{ status: number; accepted: boolean; reason: string }>,
};
