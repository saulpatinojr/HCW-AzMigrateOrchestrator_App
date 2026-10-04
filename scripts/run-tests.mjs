#!/usr/bin/env node
// Runs the Node test runner with the rule corpus located in the sibling _Addon checkout unless AMO_RULES_DIR is set (ADR-0027).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
const rules = process.env.AMO_RULES_DIR ?? resolve("../HCW-AzMigrateOrchestrator_Addon/rules");
if (!existsSync(rules)) { console.error(`rules directory not found: ${rules}\nRun 'npm run addon:bootstrap' or set AMO_RULES_DIR.`); process.exit(2); }
const r = spawnSync(process.execPath, ["--test", "packages/*/dist/**/*.test.js", "apps/*/dist/**/*.test.js", "tests/**/*.test.mjs"], { stdio: "inherit", env: { ...process.env, AMO_RULES_DIR: rules } });
process.exit(r.status ?? 1);
