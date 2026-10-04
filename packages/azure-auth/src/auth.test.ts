import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EntraTokenValidator, credentialFromEnv, WorkloadIdentityCredential, ManagedIdentityCredential, CachingCredential, StaticTokenCredential } from "./index.js";

const TENANT = "11111111-2222-3333-4444-555555555555";
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = publicKey.export({ format: "jwk" }) as { n: string; e: string };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function mint(claims: Record<string, unknown>, kid = "k1") {
  const h = b64({ alg: "RS256", typ: "JWT", kid });
  const p = b64({ iss: `https://login.microsoftonline.com/${TENANT}/v2.0`, tid: TENANT, aud: "api://amo", oid: "user-oid", sub: "s", exp: Math.floor(Date.now() / 1000) + 600, ...claims });
  const sig = sign("RSA-SHA256", Buffer.from(`${h}.${p}`), privateKey).toString("base64url");
  return `${h}.${p}.${sig}`;
}
const jwksFetch = (async (url: string) => new Response(JSON.stringify(url.includes("discovery/v2.0/keys") ? { keys: [{ kid: "k1", kty: "RSA", use: "sig", n: jwk.n, e: jwk.e }] } : {}), { status: 200 })) as unknown as typeof fetch;

test("valid Entra token passes with roles; tampering, wrong tenant/audience, expiry fail", async () => {
  const v = new EntraTokenValidator({ tenantId: TENANT, audiences: ["api://amo"], fetchImpl: jwksFetch });
  const good = await v.validate(`Bearer ${mint({ roles: ["Migration.Plan"] })}`);
  assert.equal(good.ok, true);
  if (good.ok) assert.deepEqual(good.claims.roles, ["Migration.Plan"]);
  const t = mint({});
  assert.equal((await v.validate(t.slice(0, -4) + "AAAA")).ok, false);
  assert.equal((await v.validate(mint({ tid: "other" }))).ok, false);
  assert.equal((await v.validate(mint({ aud: "api://other" }))).ok, false);
  assert.equal((await v.validate(mint({ exp: Math.floor(Date.now() / 1000) - 3600 }))).ok, false);
  assert.equal((await v.validate(mint({}, "unknown-kid"))).ok, false);
  assert.equal((await v.validate(undefined)).ok, false);
});

test("credentialFromEnv refuses client secrets and requires WIF inputs", () => {
  assert.throws(() => credentialFromEnv({ AZURE_CLIENT_SECRET: "x" }), /client secrets/);
  assert.throws(() => credentialFromEnv({ AMO_CREDENTIAL_KIND: "workload-identity-federation" }), /requires/);
  assert.equal(credentialFromEnv({ AMO_CREDENTIAL_KIND: "managed-identity" }).kind, "managed-identity");
});

test("workload identity exchanges the federated token file for an ARM token", async () => {
  const file = join(tmpdir(), `fed-${Date.now()}`);
  writeFileSync(file, "federated-assertion");
  const calls: string[] = [];
  const fake = (async (_url: string, init?: RequestInit) => { calls.push(String(init?.body)); return new Response(JSON.stringify({ access_token: "arm", expires_in: 3600 }), { status: 200 }); }) as unknown as typeof fetch;
  const t = await new WorkloadIdentityCredential(TENANT, "client", file, fake).getToken("https://management.azure.com/.default");
  assert.equal(t.token, "arm");
  assert.ok(calls[0].includes("client_assertion=federated-assertion"));
});

test("managed identity uses IDENTITY_ENDPOINT when present; caching avoids refetch", async () => {
  let n = 0;
  const fake = (async (url: string, init?: RequestInit) => { n++; assert.ok(url.startsWith("http://localhost:4242")); assert.equal((init?.headers as Record<string, string>)["X-IDENTITY-HEADER"], "hdr"); return new Response(JSON.stringify({ access_token: "mi", expires_on: Math.floor(Date.now() / 1000) + 3600 }), { status: 200 }); }) as unknown as typeof fetch;
  const c = new CachingCredential(new ManagedIdentityCredential(undefined, fake, { IDENTITY_ENDPOINT: "http://localhost:4242/msi", IDENTITY_HEADER: "hdr" }));
  await c.getToken("https://management.azure.com/.default");
  await c.getToken("https://management.azure.com/.default");
  assert.equal(n, 1);
  assert.equal((await new StaticTokenCredential("x").getToken()).token, "x");
});
