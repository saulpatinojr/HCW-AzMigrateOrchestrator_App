# CLAUDE.md — working agreement for Claude Code in this repository

This is `saulpatinojr/HCW-AzMigrateOrchestrator_App`: the authenticated, read-only-by-default Azure appliance (`apps/appliance-api`, `apps/appliance-web`, `apps/worker`, `packages/azure-auth`, `packages/azure-arm`, `packages/azure-execution`, `infrastructure/terraform/appliance-azure`). The shared core, rules, CLI, lab and UI package live in `saulpatinojr/HCW-AzMigrateOrchestrator_Addon` and are consumed at a pinned ref (ADR-0027).

- Interim dependency contract: `package.json` links `@amo/*` to the sibling `../HCW-AzMigrateOrchestrator_Addon` checkout; CI checks it out at `ADDON_REF`. Bump `ADDON_REF` deliberately and never to `main`. Phase 2 replaces the links with exact `@hybridcloudworks/migration-core` and `migration-ui` versions.
- Run `npm run addon:bootstrap` (or have the sibling built) before `npm test`; run `npm test` and `npm run web:build` before claiming anything works. Never claim a check passed that you did not run.
- Never weaken: Entra token validation on every route, the refusal of client secrets, the authorization gate and execution levels, Reader-only discovery, the "execution disabled" project profile, the "not production" labels.
- Rules are data owned by the core repository; do not fork or edit them here.
- No secrets, tokens, customer inventories or real tenant/subscription IDs anywhere, including fixtures and tests.
- Owner-pasteable commands: no placeholders; bash and PowerShell both acceptable.
- ADRs are recorded in the core repository's `docs/adr/` (shared numbering); copy appliance-relevant ones into `docs/adr/` here. Record limitations in `VALIDATION.md`.
- Read `VALIDATION.md` and the core repository's `WORKING-PLAN.md` before changing behaviour; keep both current.
