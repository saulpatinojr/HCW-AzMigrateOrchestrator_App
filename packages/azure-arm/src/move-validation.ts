import { ARM_SCOPE, type TokenCredential } from "@amo/azure-auth";
import type { EvidenceItem } from "@amo/domain";

/**
 * ARM `validateMoveResources` as authenticated evidence (ADR-0022). Read-only dry run: ARM evaluates whether the listed
 * resources can move to the target resource group and returns 204 (ok) or 409 with per-resource errors.
 */
export interface MoveValidationResult {
  ok: boolean;
  checkedAt: string;
  errors: Array<{ code: string; message: string; target?: string }>;
  evidence: EvidenceItem[];
}

export class MoveValidator {
  constructor(private readonly credential: TokenCredential, private readonly fetchImpl: typeof fetch = fetch, private readonly armBase = "https://management.azure.com", private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {}

  async validate(sourceResourceGroupId: string, resourceIds: string[], targetResourceGroupId: string): Promise<MoveValidationResult> {
    const { token } = await this.credential.getToken(ARM_SCOPE);
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const checkedAt = new Date().toISOString();
    let res = await this.fetchImpl(`${this.armBase}${sourceResourceGroupId}/validateMoveResources?api-version=2021-04-01`, { method: "POST", headers, body: JSON.stringify({ resources: resourceIds, targetResourceGroup: targetResourceGroupId }) });
    // Long-running: 202 + Location header; poll until 204 (success) or 409 (validation errors).
    let polls = 0;
    while (res.status === 202 && polls < 60) {
      const loc = res.headers.get("location");
      if (!loc) break;
      await this.sleep(Number(res.headers.get("retry-after") ?? "5") * 1000);
      res = await this.fetchImpl(loc, { headers });
      polls++;
    }
    if (res.status === 204) return { ok: true, checkedAt, errors: [], evidence: [{ state: "observed-from-azure-api", statement: `ARM validateMoveResources accepted ${resourceIds.length} resource(s) for ${targetResourceGroupId}`, date: checkedAt, source: "POST …/validateMoveResources" }] };
    if (res.status === 409) {
      const body = (await res.json()) as { error?: { code: string; message: string; details?: Array<{ code: string; message: string; target?: string }> } };
      const errors: MoveValidationResult["errors"] = body.error?.details?.length ? body.error.details : body.error ? [{ code: body.error.code, message: body.error.message }] : [{ code: "Unknown", message: "validation failed" }];
      return { ok: false, checkedAt, errors, evidence: errors.map((e) => ({ state: "observed-from-azure-api" as const, statement: `ARM validateMoveResources: ${e.code} — ${e.message}${e.target ? ` (${e.target})` : ""}`, date: checkedAt, source: "POST …/validateMoveResources" })) };
    }
    throw new Error(`validateMoveResources unexpected status ${res.status}`);
  }
}
