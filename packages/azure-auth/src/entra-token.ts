import { createPublicKey, verify as cryptoVerify, type KeyObject } from "node:crypto";

/**
 * Microsoft Entra ID access-token validation for the appliance API (ADR-0022): RS256 via the tenant's JWKS,
 * issuer/audience/tenant/expiry checks, app-role extraction. No external JWT library.
 */
export interface EntraValidatorOptions {
  tenantId: string;
  /** Accepted audiences: the API's application ID URI and/or client ID. */
  audiences: string[];
  fetchImpl?: typeof fetch;
  authorityHost?: string;
  now?: () => number;
  /** JWKS cache lifetime in ms. */
  jwksTtlMs?: number;
}

export interface EntraClaims {
  oid: string;
  tid: string;
  sub: string;
  roles: string[];
  scp?: string;
  name?: string;
  preferred_username?: string;
  exp: number;
  aud: string;
  iss: string;
}

interface Jwk { kid: string; kty: string; n: string; e: string; use?: string }

const b64url = (s: string): Buffer => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export class EntraTokenValidator {
  private keys = new Map<string, KeyObject>();
  private keysFetchedAt = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly authority: string;
  private readonly now: () => number;
  constructor(private readonly opts: EntraValidatorOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
    this.authority = (opts.authorityHost ?? "https://login.microsoftonline.com").replace(/\/$/, "");
    this.now = opts.now ?? Date.now;
  }

  get jwksUri(): string { return `${this.authority}/${this.opts.tenantId}/discovery/v2.0/keys`; }
  private get issuers(): string[] { return [`${this.authority}/${this.opts.tenantId}/v2.0`, `https://sts.windows.net/${this.opts.tenantId}/`]; }

  private async loadKeys(force = false): Promise<void> {
    const ttl = this.opts.jwksTtlMs ?? 6 * 3600_000;
    if (!force && this.keys.size && this.now() - this.keysFetchedAt < ttl) return;
    const res = await this.fetchImpl(this.jwksUri);
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    const { keys } = (await res.json()) as { keys: Jwk[] };
    this.keys = new Map(keys.filter((k) => k.kty === "RSA" && (!k.use || k.use === "sig")).map((k) => [k.kid, createPublicKey({ key: { kty: "RSA", n: k.n, e: k.e }, format: "jwk" })]));
    this.keysFetchedAt = this.now();
  }

  async validate(bearer: string | undefined): Promise<{ ok: true; claims: EntraClaims } | { ok: false; reason: string }> {
    if (!bearer) return { ok: false, reason: "missing bearer token" };
    const token = bearer.replace(/^Bearer\s+/i, "");
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, reason: "malformed token" };
    let header: { alg: string; kid: string };
    let claims: EntraClaims;
    try {
      header = JSON.parse(b64url(parts[0]).toString("utf8"));
      claims = JSON.parse(b64url(parts[1]).toString("utf8"));
    } catch { return { ok: false, reason: "undecodable token" }; }
    if (header.alg !== "RS256") return { ok: false, reason: `unsupported alg ${header.alg}` };
    await this.loadKeys();
    let key = this.keys.get(header.kid);
    if (!key) { await this.loadKeys(true); key = this.keys.get(header.kid); }
    if (!key) return { ok: false, reason: "unknown signing key" };
    const sigOk = cryptoVerify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, b64url(parts[2]));
    if (!sigOk) return { ok: false, reason: "bad signature" };
    const nowS = Math.floor(this.now() / 1000);
    if (typeof claims.exp !== "number" || claims.exp < nowS - 60) return { ok: false, reason: "expired" };
    if (!this.issuers.includes(claims.iss)) return { ok: false, reason: "issuer mismatch" };
    if (claims.tid !== this.opts.tenantId) return { ok: false, reason: "tenant mismatch" };
    if (!this.opts.audiences.includes(claims.aud)) return { ok: false, reason: "audience mismatch" };
    if (!claims.oid) return { ok: false, reason: "no object id" };
    return { ok: true, claims: { ...claims, roles: claims.roles ?? [] } };
  }
}
