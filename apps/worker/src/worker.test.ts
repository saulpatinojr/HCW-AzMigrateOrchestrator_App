import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryRepository } from "@amo/appliance-api";
import { StaticTokenCredential } from "@amo/azure-auth";
import { runOnce } from "./index.js";

test("worker polls due operations, respects retry-after, and audits completion", async () => {
  const repo = new InMemoryRepository();
  const t0 = new Date("2026-10-03T12:00:00Z");
  await repo.saveOperation({ id: "a", kind: "resource-mover.prepare", targetKey: "mc1", operationUrl: "https://op/a", status: "InProgress", startedBy: "e", startedAt: t0.toISOString(), updatedAt: t0.toISOString(), retryAfterSeconds: 10, error: null });
  await repo.saveOperation({ id: "b", kind: "resource-mover.prepare", targetKey: "mc1", operationUrl: "https://op/b", status: "InProgress", startedBy: "e", startedAt: t0.toISOString(), updatedAt: t0.toISOString(), retryAfterSeconds: 600, error: null });
  const fake = (async (url: string) => new Response(JSON.stringify({ status: url.endsWith("/a") ? "Succeeded" : "InProgress" }), { status: 200 })) as unknown as typeof fetch;
  const r = await runOnce({ repository: repo, credential: new StaticTokenCredential(), fetchImpl: fake, now: () => new Date(t0.getTime() + 30000) });
  assert.equal(r.polled, 1, "b is not due yet (retry-after 600s)");
  assert.equal(r.completed[0].id, "a");
  assert.equal((await repo.pendingOperations()).length, 1);
  assert.ok(repo.events.some((e) => e.event === "operation.succeeded"));
});
