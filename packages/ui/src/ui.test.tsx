import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MigrationExplorer, ResultsStage, EnterpriseCta, PoweredBy, PARTNERS, previewCsv, LabApiClient, SummaryPanel, DecisionTable, type Stage, type MigrationAddOnHealth } from "./index.js";
import type { Assessment, AssessmentSummary, ResourceDecisionRecord } from "@amo/domain";

test("MigrationExplorer renders the disclaimer and upload step without touching window at module load", () => {
  const html = renderToStaticMarkup(<MigrationExplorer apiBaseUrl="https://labs-api.example" />);
  assert.ok(html.includes("never connects to an Azure tenant"));
  assert.ok(html.includes("https://labs-api.example/api/sample.csv"));
  assert.ok(html.includes("Powered by"));
  assert.ok(!html.includes("Run assessment"), "questionnaire hidden until a file is chosen");
});

test("PoweredBy lists every partner with an honest role statement", () => {
  const html = renderToStaticMarkup(<PoweredBy />);
  for (const p of PARTNERS) { assert.ok(html.includes(p.name)); assert.ok(html.includes(p.role.slice(0, 20))); }
  assert.ok(PARTNERS.some((p) => p.name === "Hostinger"));
});

test("previewCsv warns on missing columns and sniffs delimiter", () => {
  const p = previewCsv("NAME;LOCATION\nx;y\n");
  assert.equal(p.headers.length, 2);
  assert.ok(p.warnings.some((w) => w.includes("TYPE")));
  assert.equal(previewCsv("NAME,TYPE,RESOURCE ID\na,b,c").warnings.length, 0);
});

test("LabApiClient keeps the owner token in memory and sends it on later calls", async () => {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fake = (async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers as Record<string, string>) ?? {} });
    if (url.endsWith("/api/assessments")) return new Response(JSON.stringify({ assessmentId: "11111111-2222-4333-8444-555555555555", ownerToken: "tok", expiresAt: null, summary: {}, progress: [], ingestionWarnings: [] }), { status: 201 });
    return new Response(JSON.stringify({ assessment: {}, files: [] }), { status: 200 });
  }) as unknown as typeof fetch;
  const c = new LabApiClient({ baseUrl: "https://x/", fetchImpl: fake });
  await c.create({ csv: "NAME,TYPE\na,b" }, "turnstile-token");
  await c.get();
  assert.equal(calls[0].headers["x-turnstile-token"], "turnstile-token");
  assert.equal(calls[1].headers["x-owner-token"], "tok");
  assert.ok(calls[1].url.startsWith("https://x/api/assessments/1111"));
});

test("SummaryPanel and DecisionTable render data", () => {
  const summary: AssessmentSummary = { resourceCount: 2, dispositionTotals: { "native-move": 1, "orchestrated-migration": 0, "recreate-and-migrate": 1, "recreate-only": 0, retain: 0, retire: 0, replace: 0, redesign: 0, "unknown-requires-validation": 0 }, unknownCount: 0, confidenceTotals: { low: 0, medium: 2, high: 0 }, complexityBand: "low", keyBlockers: ["x (1)"], disclaimers: ["Demo"] };
  const html = renderToStaticMarkup(<SummaryPanel summary={summary} expiresAt={null} onDownload={() => {}} onDelete={() => {}} />);
  assert.ok(html.includes("recreate-and-migrate") && html.includes("Key blockers"));
  const d = { resourceKey: "k", displayName: "vm1", resourceType: "Microsoft.Compute/virtualMachines", disposition: "native-move", infrastructureDisposition: "move-with-resource", dataDisposition: "move-with-resource", recommendedTool: "arm-move", confidence: { band: "medium", score: 0.7, rationale: [] } } as unknown as ResourceDecisionRecord;
  assert.ok(renderToStaticMarkup(<DecisionTable decisions={[d]} onSelect={() => {}} />).includes("vm1"));
});

const SUMMARY_FIXTURE: AssessmentSummary = { resourceCount: 1, dispositionTotals: { "native-move": 1, "orchestrated-migration": 0, "recreate-and-migrate": 0, "recreate-only": 0, retain: 0, retire: 0, replace: 0, redesign: 0, "unknown-requires-validation": 0 }, unknownCount: 0, confidenceTotals: { low: 0, medium: 1, high: 0 }, complexityBand: "low", keyBlockers: [], disclaimers: ["Demo"] };
const DECISION_FIXTURE = { resourceKey: "k", displayName: "vm1", resourceType: "Microsoft.Compute/virtualMachines", disposition: "native-move", infrastructureDisposition: "move-with-resource", dataDisposition: "move-with-resource", recommendedTool: "arm-move", confidence: { band: "medium", score: 0.7, rationale: [] } } as unknown as ResourceDecisionRecord;
const RESULTS_FIXTURE = { summary: SUMMARY_FIXTURE, decisions: [DECISION_FIXTURE], wavePlan: { waves: [], notes: [] } } as unknown as Assessment;
const resultsProps = { assessment: RESULTS_FIXTURE, expiresAt: null, files: [], loadFile: async () => "", onDownload: () => {}, onDelete: () => {}, contactUrl: "https://hybridcloudworks.com/contact", contactPath: "/contact" };

test("MigrationExplorer renders with no props and points the sample link at the same origin", () => {
  const html = renderToStaticMarkup(<MigrationExplorer />);
  assert.ok(html.includes('href="/api/sample.csv"'));
});
test("MigrationExplorer renders the partner panel by default", () => {
  assert.ok(renderToStaticMarkup(<MigrationExplorer />).includes("Powered by"));
});
test('MigrationExplorer with partners={false} renders no partner name and no "Powered by"', () => {
  const html = renderToStaticMarkup(<MigrationExplorer partners={false} />);
  assert.ok(!html.includes("Powered by"));
  for (const p of PARTNERS) assert.ok(!html.includes(p.name), p.name);
});
test("MigrationExplorer calls no stage callback during server rendering", () => {
  const seen: Stage[] = [];
  renderToStaticMarkup(<MigrationExplorer onStageChange={(s) => seen.push(s)} onNavigate={() => {}} />);
  assert.deepEqual(seen, []);
});
test("ResultsStage renders the enterprise CTA by default", () => {
  const html = renderToStaticMarkup(<ResultsStage {...resultsProps} />);
  assert.ok(html.includes("Talk to Hybrid Cloud Works") && html.includes("vm1"));
});
test("ResultsStage with cta={false} renders no enterprise CTA", () => {
  const html = renderToStaticMarkup(<ResultsStage {...resultsProps} cta={false} />);
  assert.ok(!html.includes("Talk to Hybrid Cloud Works") && !html.includes("Need an assessment you can act on?"));
  assert.ok(html.includes("vm1"));
});
test("EnterpriseCta renders a button and no href when a host handles navigation", () => {
  const html = renderToStaticMarkup(<EnterpriseCta contactUrl="https://hybridcloudworks.com/contact" contactPath="/contact" onNavigate={() => {}} />);
  assert.ok(html.includes("<button") && !html.includes("href="));
});
test("EnterpriseCta renders an in-frame link when no host handles navigation", () => {
  const html = renderToStaticMarkup(<EnterpriseCta contactUrl="https://hybridcloudworks.com/contact" contactPath="/contact" />);
  assert.ok(html.includes('href="https://hybridcloudworks.com/contact"') && !html.includes("<button"));
});
test("LabApiClient.health returns the body as the typed envelope", async () => {
  const body: MigrationAddOnHealth = { ok: true, id: "migration", version: "0.3.0", edition: "demo", capabilities: ["assessments"], asOf: "2026-10-10T00:00:00.000Z", siteOrigins: ["https://hybridcloudworks.com", "https://www.hybridcloudworks.com"], turnstile: { required: true, siteKey: "1x00000000000000000000AA" }, workspace: "disabled", rulesLoaded: 35, azureConnectivity: "disabled-by-design" };
  const fake = (async (url: string) => {
    assert.equal(url, "/api/health");
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  const h = await new LabApiClient({ baseUrl: "", fetchImpl: fake }).health();
  assert.equal(h.turnstile.siteKey, "1x00000000000000000000AA");
  assert.deepEqual(h.siteOrigins, body.siteOrigins);
  assert.equal(h.workspace, "disabled");
});
