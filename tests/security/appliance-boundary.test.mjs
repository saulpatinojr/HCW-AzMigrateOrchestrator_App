import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * _App is the appliance (ADR-0027). It has no CSV upload surface and no unauthenticated assessment path; the lab lives in
 * saulpatinojr/HCW-AzMigrateOrchestrator_Addon. The interface package stays in the core so the lab can never construct an Azure provider.
 */
const srcFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? srcFiles(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));

test("no lab code or CSV upload surface is present in the appliance", () => {
  for (const a of ["lab-api", "lab-web", "ui-harness", "cli"]) assert.ok(!existsSync(join("apps", a)), `apps/${a} belongs to saulpatinojr/HCW-AzMigrateOrchestrator_Addon`);
  for (const a of ["appliance-api", "worker"]) {
    const pkg = JSON.parse(readFileSync(join("apps", a, "package.json"), "utf8"));
    for (const d of Object.keys(pkg.dependencies ?? {})) assert.ok(!["@amo/csv-ingestion", "@amo/workspace-provider", "@amo/ui"].includes(d), `${a} depends on lab package ${d}`);
    for (const f of srcFiles(join("apps", a, "src"))) {
      const text = readFileSync(f, "utf8");
      for (const bad of ["@amo/csv-ingestion", "parseCreateAssessmentRequest", "sample.csv", "multipart/form-data", "TURNSTILE"]) assert.ok(!text.includes(bad), `${f} contains ${bad}`);
    }
  }
});

test("the Azure clients live here and the discovery interface stays in the core", () => {
  for (const p of ["azure-auth", "azure-arm", "azure-execution"]) assert.ok(existsSync(join("packages", p, "package.json")), `packages/${p} missing`);
  assert.ok(!existsSync("packages/azure-discovery"), "the DiscoveryProvider interface package belongs to the core (saulpatinojr/HCW-AzMigrateOrchestrator_Addon)");
  const arm = JSON.parse(readFileSync("packages/azure-arm/package.json", "utf8"));
  assert.ok(Object.keys(arm.dependencies).includes("@amo/azure-discovery"), "azure-arm implements the core interface");
});

test("the appliance API fails closed: every request is token-validated before any assessment work", () => {
  const src = readFileSync("apps/appliance-api/src/index.ts", "utf8");
  assert.ok(src.includes("EntraTokenValidator"), "token validator missing");
  assert.ok(src.includes("401"), "no 401 path");
  assert.ok(!/AMO_CLIENT_SECRET|clientSecret\s*[:=]/.test(src), "client secrets are never accepted (ADR-0007)");
});
