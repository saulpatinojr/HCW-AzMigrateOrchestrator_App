import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** Ticket #49: base images are pinned as tag@sha256:<64 hex>, and Dependabot keeps the digests current. */
const PIN = /^[a-z0-9./_-]+:[\w.-]+@sha256:[0-9a-f]{64}$/;

test("every FROM in the appliance Dockerfile is tag@sha256", () => {
  const froms = [...readFileSync("infrastructure/docker/Dockerfile.appliance", "utf8").matchAll(/^FROM\s+(\S+)/gm)].map((m) => m[1]);
  assert.ok(froms.length >= 2, "expected the build and runtime stages");
  for (const f of froms) assert.match(f, PIN, `FROM ${f} is not pinned by digest`);
});

test("every image in the appliance compose file is tag@sha256", () => {
  const images = [...readFileSync("docker-compose.appliance.yml", "utf8").matchAll(/^\s*image:\s*(\S+)/gm)].map((m) => m[1]);
  assert.ok(images.length >= 1);
  for (const i of images) assert.match(i, PIN, `image ${i} is not pinned by digest`);
});

test("Dependabot watches the Dockerfile directory and the compose file", () => {
  const d = readFileSync(".github/dependabot.yml", "utf8");
  assert.match(d, /package-ecosystem:\s*docker\s*\n\s*directory:\s*\/infrastructure\/docker/);
  assert.match(d, /package-ecosystem:\s*docker-compose\s*\n\s*directory:\s*\//);
});
