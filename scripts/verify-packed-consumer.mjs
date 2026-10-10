#!/usr/bin/env node
/**
 * Clean-consumer gate (WORKING-PLAN.md Phase 2): `npm pack` both assembled packages, install them into an empty project
 * from the tarballs, run an assessment through the installed core, import the UI package, and type-check a consumer
 * against the installed declarations. Fails if any `@amo/` reference leaks into the installed packages.
 * Needs network access for react/react-dom/@radix-ui (registry). Run after `npm run build`.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const OUT = join(ROOT, "dist-packages");
if (!existsSync(join(OUT, "migration-core/package.json"))) throw new Error("dist-packages missing — run npm run build");
const tmp = mkdtempSync(join(tmpdir(), "amo-consumer-"));
const run = (cmd, args, cwd) => { const r = spawnSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" }); if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`); };
const out = (cmd, args, cwd) => { const r = spawnSync(cmd, args, { cwd, encoding: "utf8", shell: process.platform === "win32" }); if (r.status !== 0) throw new Error(r.stderr || r.stdout); return r.stdout.trim(); };

try {
  const coreTgz = join(tmp, out("npm", ["pack", "--pack-destination", tmp, "--silent"], join(OUT, "migration-core")).split(/\r?\n/).pop());
  const uiTgz = join(tmp, out("npm", ["pack", "--pack-destination", tmp, "--silent"], join(OUT, "migration-ui")).split(/\r?\n/).pop());
  const proj = join(tmp, "consumer"); cpSync(join(ROOT, "samples/resources-csv/sample-resources.csv"), join(proj, "sample.csv"));
  writeFileSync(join(proj, "package.json"), JSON.stringify({ name: "amo-consumer", private: true, type: "module" }));
  run("npm", ["install", "--no-audit", "--no-fund", "--silent", coreTgz, uiTgz, "react@^19", "react-dom@^19", "@types/react@^19", "@types/react-dom@^19"], proj);

  // 1. nothing internal leaked
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  const leaks = walk(join(proj, "node_modules/@hybridcloudworks")).filter((f) => /\.(js|ts|json)$/.test(f) && readFileSync(f, "utf8").includes("@amo/"));
  if (leaks.length) throw new Error("internal @amo/ references leaked: " + leaks.join(", "));
  const corePkg = JSON.parse(readFileSync(join(proj, "node_modules/@hybridcloudworks/migration-core/package.json"), "utf8"));
  for (const bad of ["./azure-auth", "./azure-arm", "./azure-execution"]) if (bad in corePkg.exports) throw new Error(`published core must not export ${bad}`);

  // 2. runtime: assess the sample through the installed package, rules found inside node_modules without configuration
  writeFileSync(join(proj, "consumer.mjs"), `
import { readFileSync } from "node:fs";
import { Orchestrator } from "@hybridcloudworks/migration-core/agents";
import { defaultRulesDir } from "@hybridcloudworks/migration-core/evidence-engine";
import { API_LIMITS, isAddOnHealth } from "@hybridcloudworks/migration-core/contracts";
import * as ui from "@hybridcloudworks/migration-ui";
const rulesDir = defaultRulesDir();
if (!rulesDir.replace(/\\\\/g, "/").includes("node_modules/@hybridcloudworks/migration-core/rules")) throw new Error("rules not resolved from the package: " + rulesDir);
const o = new Orchestrator({ edition: "demo", now: () => new Date("2026-10-04T00:00:00Z") });
const { assessment, bundle } = await o.assessCsv(readFileSync("sample.csv", "utf8"), { destinationRegion: "westus3", sameTenant: true, sameSubscription: true, downtimeTolerance: "hours" });
if (!assessment || Object.keys(bundle.files).length < 10) throw new Error("assessment produced no bundle");
if (typeof ui.MigrationExplorer !== "function") throw new Error("MigrationExplorer missing from the UI package");
if (typeof ui.EnterpriseCta !== "function") throw new Error("EnterpriseCta missing from the UI package");
if (isAddOnHealth({}) !== false) throw new Error("isAddOnHealth broken");
if (!API_LIMITS.maxUploadBytes) throw new Error("contracts subpath broken");
console.log("consumer ok:", assessment.decisions?.length ?? Object.keys(bundle.files).length, "decisions/files; rules from", rulesDir);
`);
  run("node", ["consumer.mjs"], proj);

  // 3. types: a strict consumer compiles against the installed declarations
  writeFileSync(join(proj, "consumer.ts"), `
import type { ResourceDecisionRecord, MigrationIntent } from "@hybridcloudworks/migration-core/domain";
import type { CreateAssessmentRequest, AddOnHealth, AddOnPaneMessage, AddOnPaneState } from "@hybridcloudworks/migration-core/contracts";
import { ADDON_HEALTH_FIELDS, ADDON_PANE_STATES, isAddOnHealth } from "@hybridcloudworks/migration-core/contracts";
import { Orchestrator } from "@hybridcloudworks/migration-core/agents";
import { MigrationExplorer, EnterpriseCta, LabApiClient, type MigrationExplorerProps, type EnterpriseCtaProps, type Stage, type MigrationAddOnHealth } from "@hybridcloudworks/migration-ui";
const intent: Partial<MigrationIntent> = { destinationRegion: "westus3" };
const req: CreateAssessmentRequest = { csv: "a,b", intent };
const o: Orchestrator = new Orchestrator({ edition: "demo" });
const pick = (d: ResourceDecisionRecord) => d.disposition;
const stage: Stage = "upload";
const paneState: AddOnPaneState = ADDON_PANE_STATES[0];
const message: AddOnPaneMessage = { type: "hcw-addon", id: "migration", state: paneState };
const props: MigrationExplorerProps = { apiBaseUrl: "", partners: false, cta: true, contactPath: "/contact", onStageChange: (s: Stage) => void s, onNavigate: (p: string) => void p };
const ctaProps: EnterpriseCtaProps = { contactUrl: "https://hybridcloudworks.com/contact", contactPath: "/contact" };
const fields: readonly string[] = ADDON_HEALTH_FIELDS;
const check = (x: unknown): x is AddOnHealth => isAddOnHealth(x);
const health = (): Promise<MigrationAddOnHealth> => new LabApiClient({ baseUrl: "" }).health();
export { req, o, pick, stage, message, props, ctaProps, fields, check, health, MigrationExplorer, EnterpriseCta };
`);
  writeFileSync(join(proj, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "Node16", moduleResolution: "Node16", strict: true, jsx: "react-jsx", noEmit: true, skipLibCheck: true, types: [] }, files: ["consumer.ts"] }));
  run("node", [join(ROOT, "node_modules/typescript/bin/tsc"), "-p", "tsconfig.json"], proj);
  console.log("packed-consumer verification passed");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
