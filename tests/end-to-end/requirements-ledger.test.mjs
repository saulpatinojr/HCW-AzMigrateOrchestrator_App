import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

/**
 * docs/requirements-ledger.md points at code, tests and docs. Paths drift when files move (the split, ADR-0027, and the
 * azure-arm package did exactly that), so every path-looking `code span` in the ledger tables must exist in this repository,
 * with only these declared exceptions:
 *  - a path directly followed by *(downstream)* or *(retired)* (the legend is at the top of the ledger);
 *  - a path in a row that says "downstream" and sits under a lab-only prefix (the older row-level convention);
 *  - the names of files the bundle generator writes into every bundle (they are outputs, not repository files).
 */
const LAB_PREFIXES = ["apps/lab-api", "apps/lab-web", "apps/ui-harness", "infrastructure/coder", "coder-template.yml", "playwright.config.ts", "tests/e2e/"];
const BUNDLE_FILES = ["VALIDATION-STATUS.md"];

const expandBraces = (p) => {
  const m = p.match(/^(.*?)\{([^{}]*)\}(.*)$/);
  return m ? m[2].split(",").flatMap((alt) => expandBraces(m[1] + alt + m[3])) : [p];
};
const exists = (p) => {
  const base = p.replace(/\/?\*.*$/, ""); // a wildcard stands for "some of these": the directory before it must exist
  return existsSync(base || ".") || existsSync(`.github/workflows/${p}`);
};
const looksLikePath = (t) => !/\s/.test(t) && !t.startsWith("/") && !t.includes("…") && !t.includes("://") && !t.startsWith("saulpatinojr/") && (t.includes("/") || /\.(ts|tsx|mjs|md|json|yml|tf|sh|ps1)$/.test(t));

test("every repository path named in the requirements ledger exists (or is marked downstream or retired)", () => {
  const generated = readFileSync("packages/artifact-generator/src/bundle.ts", "utf8");
  const missing = [];
  readFileSync("docs/requirements-ledger.md", "utf8").split("\n").forEach((line, i) => {
    if (!line.startsWith("|")) return;
    const downstreamRow = /downstream/i.test(line);
    for (const m of line.matchAll(/`([^`]+)`( \*\((downstream|retired)\)\*)?/g)) {
      const [, token, marker] = m;
      if (!looksLikePath(token) || marker) continue;
      if (BUNDLE_FILES.includes(token)) { assert.ok(generated.includes(token), `${token} is no longer written by the bundle generator`); continue; }
      for (const p of expandBraces(token)) {
        if (exists(p)) continue;
        if (downstreamRow && LAB_PREFIXES.some((x) => p.startsWith(x))) continue;
        missing.push(`line ${i + 1}: ${p}`);
      }
    }
  });
  assert.deepEqual(missing, [], `ledger paths that do not exist:\n${missing.join("\n")}`);
});

test("the ledger test itself notices a missing path", () => {
  assert.equal(exists("packages/does-not-exist/src/x.ts"), false);
  assert.equal(exists("packages/azure-arm/src/scopes.ts"), true);
  assert.deepEqual(expandBraces("a/{b,c}.ts"), ["a/b.ts", "a/c.ts"]);
});
