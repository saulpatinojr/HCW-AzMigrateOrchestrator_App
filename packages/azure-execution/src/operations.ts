import { ARM_SCOPE, type TokenCredential } from "@amo/azure-auth";

/**
 * Azure long-running operation tracking (ADR-0026). Resource Mover actions return 202 with an `Azure-AsyncOperation`
 * URL; polling it yields Succeeded / Failed / Canceled / InProgress. The worker owns the polling loop; this is one step.
 */
export type OperationStatus = "InProgress" | "Succeeded" | "Failed" | "Canceled" | "Unknown";

export interface TrackedOperation {
  id: string;
  kind: string;            // e.g. resource-mover.initiateMove
  targetKey: string;       // e.g. move collection name
  operationUrl: string;
  status: OperationStatus;
  startedBy: string;
  startedAt: string;
  updatedAt: string;
  retryAfterSeconds: number;
  error: string | null;
}

export async function pollOperation(credential: TokenCredential, op: TrackedOperation, fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()): Promise<TrackedOperation> {
  const { token } = await credential.getToken(ARM_SCOPE);
  const res = await fetchImpl(op.operationUrl, { headers: { authorization: `Bearer ${token}` } });
  const updatedAt = now().toISOString();
  if (res.status === 202) return { ...op, status: "InProgress", updatedAt, retryAfterSeconds: Number(res.headers.get("retry-after") ?? op.retryAfterSeconds) };
  if (!res.ok) return { ...op, status: "Unknown", updatedAt, error: `HTTP ${res.status}` };
  const body = (await res.json().catch(() => ({}))) as { status?: string; error?: { code?: string; message?: string } };
  const s = (body.status ?? "Succeeded") as string;
  const status: OperationStatus = /succeeded/i.test(s) ? "Succeeded" : /failed/i.test(s) ? "Failed" : /cancel/i.test(s) ? "Canceled" : /progress|running|accepted/i.test(s) ? "InProgress" : "Unknown";
  return { ...op, status, updatedAt, retryAfterSeconds: Number(res.headers.get("retry-after") ?? op.retryAfterSeconds), error: body.error ? `${body.error.code ?? ""} ${body.error.message ?? ""}`.trim() : null };
}

export const isTerminal = (s: OperationStatus): boolean => s === "Succeeded" || s === "Failed" || s === "Canceled";
