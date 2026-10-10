import type { Assessment, MigrationIntent, ProgressEvent, ResourceDecisionRecord } from "@amo/domain";

/** API contracts shared by lab-api, appliance-api and web clients. Documented in docs/api/openapi.yaml. */

export interface CreateAssessmentRequest {
  /** Raw CSV text (resources.csv export). Max size enforced server-side. */
  csv: string;
  fileName?: string;
  intent?: Partial<MigrationIntent>;
}

export interface CreateAssessmentResponse {
  assessmentId: string;
  /** Opaque owner token; required for all later operations on this assessment (per-user isolation). */
  ownerToken: string;
  expiresAt: string | null;
  summary: Assessment["summary"];
  progress: ProgressEvent[];
  ingestionWarnings: string[];
}

export interface GetAssessmentResponse {
  assessment: Omit<Assessment, "decisions"> & { decisions: ResourceDecisionRecord[] };
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export const API_LIMITS = {
  maxUploadBytes: 5 * 1024 * 1024,
  maxRows: 5000,
  assessmentTtlMinutes: 120,
} as const;

/** Validates an incoming request body without external schema libraries. */
export function parseCreateAssessmentRequest(body: unknown): { ok: true; value: CreateAssessmentRequest } | { ok: false; error: ApiError } {
  if (!body || typeof body !== "object") return { ok: false, error: { error: { code: "invalid_body", message: "JSON object required" } } };
  const b = body as Record<string, unknown>;
  if (typeof b.csv !== "string" || b.csv.length === 0) return { ok: false, error: { error: { code: "csv_required", message: "csv must be a non-empty string" } } };
  if (b.csv.length > API_LIMITS.maxUploadBytes) return { ok: false, error: { error: { code: "too_large", message: `csv exceeds ${API_LIMITS.maxUploadBytes} bytes` } } };
  if (b.fileName !== undefined && (typeof b.fileName !== "string" || !/^[\w .()-]{1,120}\.csv$/i.test(b.fileName))) return { ok: false, error: { error: { code: "invalid_filename", message: "fileName must be a plain .csv name" } } };
  if (b.intent !== undefined && (typeof b.intent !== "object" || b.intent === null)) return { ok: false, error: { error: { code: "invalid_intent", message: "intent must be an object" } } };
  const intent = (b.intent ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(intent)) {
    // `key` is blocked except as the suffix of a tag-key selector (e.g. `applicationGroupTagKey`), which names a tag, not a credential.
    if (/password|secret|token|(?<!tag)key|connectionstring|credential|certificate/i.test(k)) {
      return { ok: false, error: { error: { code: "prohibited_field", message: `intent must never contain credentials (${k})` } } };
    }
  }
  return { ok: true, value: { csv: b.csv, fileName: b.fileName as string | undefined, intent: intent as Partial<MigrationIntent> } };
}

/** Health envelope every HCW AddOn serves at GET /api/health (HCW AddOn Integration Standard section 11). Flat: id and version at the top level. */
export interface AddOnHealth {
  ok: boolean;
  id: string;
  version: string;
  edition: string;
  capabilities: string[];
  asOf: string;
  /** Site origins the pane may post hcw-addon messages to; from the AddOn's environment, never from the image. */
  siteOrigins: string[];
  turnstile: { required: boolean; siteKey: string | null };
}

export const ADDON_HEALTH_FIELDS = ["ok", "id", "version", "edition", "capabilities", "asOf", "siteOrigins", "turnstile"] as const;

/** Structural guard; the website's proxy applies its own projection and length limits on top. */
export function isAddOnHealth(x: unknown): x is AddOnHealth {
  if (!x || typeof x !== "object") return false;
  const h = x as Record<string, unknown>;
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");
  const t = h.turnstile;
  if (!t || typeof t !== "object") return false;
  const { required, siteKey } = t as Record<string, unknown>;
  if (typeof required !== "boolean" || !(siteKey === null || typeof siteKey === "string")) return false;
  // Invariant: a pane cannot initialise the widget without a key, so required implies a non-empty site key.
  if (required && !siteKey) return false;
  return typeof h.ok === "boolean" && typeof h.id === "string" && typeof h.version === "string" && typeof h.edition === "string"
    && strings(h.capabilities) && typeof h.asOf === "string" && strings(h.siteOrigins);
}

/** Pane protocol (standard section 8): AddOn to site only, one shape, four states. */
export const ADDON_PANE_STATES = ["loading", "ready", "working", "unavailable"] as const;
export type AddOnPaneState = (typeof ADDON_PANE_STATES)[number];
export interface AddOnPaneMessage {
  type: "hcw-addon";
  id: string;
  state: AddOnPaneState;
  /** A site path from the website's allow-list; honoured only when the catalogue row grants `navigate`. */
  navigate?: string;
}
