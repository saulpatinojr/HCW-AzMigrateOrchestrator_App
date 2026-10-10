import { test } from "node:test";
import assert from "node:assert/strict";
import { ADDON_HEALTH_FIELDS, ADDON_PANE_STATES, isAddOnHealth, parseCreateAssessmentRequest } from "./index.js";

test("rejects credential-shaped questionnaire fields", () => {
  const r = parseCreateAssessmentRequest({ csv: "a,b", intent: { clientSecret: "x" } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.error.code, "prohibited_field");
});
test("rejects key-shaped questionnaire fields", () => {
  for (const k of ["apiKey", "accountKey", "accessKey", "key"]) {
    const r = parseCreateAssessmentRequest({ csv: "a,b", intent: { [k]: "x" } });
    assert.equal(r.ok, false, k);
    if (!r.ok) assert.equal(r.error.error.code, "prohibited_field");
  }
});
test("accepts the tag-key selector applicationGroupTagKey", () => {
  const r = parseCreateAssessmentRequest({ csv: "a,b", intent: { applicationGroupTagKey: "application" } });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.intent?.applicationGroupTagKey, "application");
});
test("rejects path-like file names", () => {
  const r = parseCreateAssessmentRequest({ csv: "a,b", fileName: "../../etc/passwd.csv" });
  assert.equal(r.ok, false);
});
test("accepts a minimal valid request", () => {
  const r = parseCreateAssessmentRequest({ csv: "NAME,TYPE\nx,y", fileName: "resources.csv" });
  assert.equal(r.ok, true);
});

const health = { ok: true, id: "migration", version: "0.3.0", edition: "demo", capabilities: ["assessments", "sample-csv", "bundle-download"], asOf: "2026-10-10T00:00:00.000Z", siteOrigins: ["https://hybridcloudworks.com", "https://www.hybridcloudworks.com"], turnstile: { required: true, siteKey: "1x00000000000000000000AA" }, rulesLoaded: 35, azureConnectivity: "disabled-by-design" };

test("isAddOnHealth accepts the documented flat envelope with extras", () => { assert.equal(isAddOnHealth(health), true); });
test("isAddOnHealth accepts a not-required turnstile block with a null site key", () => {
  assert.equal(isAddOnHealth({ ...health, turnstile: { required: false, siteKey: null } }), true);
});
test("isAddOnHealth rejects turnstile required without a site key", () => {
  assert.equal(isAddOnHealth({ ...health, turnstile: { required: true, siteKey: null } }), false);
  assert.equal(isAddOnHealth({ ...health, turnstile: { required: true, siteKey: "" } }), false);
});
test("isAddOnHealth rejects a nested addon envelope", () => {
  const { id, version, ...rest } = health;
  assert.equal(isAddOnHealth({ ...rest, addon: { id, version } }), false);
});
test("isAddOnHealth rejects a missing turnstile block and a non-string site origin", () => {
  assert.equal(isAddOnHealth({ ...health, turnstile: undefined }), false);
  assert.equal(isAddOnHealth({ ...health, siteOrigins: [1] }), false);
});
test("ADDON_HEALTH_FIELDS names exactly the eight required fields in order", () => {
  assert.deepEqual([...ADDON_HEALTH_FIELDS], ["ok", "id", "version", "edition", "capabilities", "asOf", "siteOrigins", "turnstile"]);
});
test("ADDON_PANE_STATES is loading, ready, working, unavailable", () => {
  assert.deepEqual([...ADDON_PANE_STATES], ["loading", "ready", "working", "unavailable"]);
});
