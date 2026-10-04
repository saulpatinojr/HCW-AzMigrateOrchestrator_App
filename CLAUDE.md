# CLAUDE.md — working agreement for Claude Code in this repository

This is `saulpatinojr/HCW-AzMigrateOrchestrator_App`, the **upstream product** (ADR-0028): the migration intelligence core
(`packages/*`), the rule corpus (`rules/`), the `amo` CLI, the explorer UI components and the Azure appliance. It publishes
`@hybridcloudworks/migration-core` and `@hybridcloudworks/migration-ui` (assembled by `scripts/assemble-packages.mjs` into
`dist-packages/`). The slim web-front edition `saulpatinojr/HCW-AzMigrateOrchestrator_Addon` consumes those packages at exact
versions and must stay technically unable to reach Azure: `azure-auth`, `azure-arm` and `azure-execution` are never published
(`tests/security/appliance-boundary.test.mjs`, `tests/packaging/`).

- Read `docs/requirements-ledger.md`, `WORKING-PLAN.md` and `VALIDATION.md` before changing behaviour; keep them current.
- Run `npm test` and `npm run rules:validate` before claiming anything works; run `npm run packages:verify` when a package's
  public surface, exports or the rules location change. Never claim a check passed that you did not run.
- A change to any `packages/*` public surface is a change to the published packages and to the downstream edition: say so in
  the PR; releases are semver tags (`v*`), and the addon's `core-update` workflow tests each release before adopting it.
- Rules are data: change `scripts/author-rules.mjs` → `node scripts/author-rules.mjs` → build → `amo rules report` → `amo rules snapshot`. Cite Microsoft Learn with a retrieval date.
- Golden files (`samples/expected-reports`) change only deliberately via `npm run goldens:update`; explain the diff in the PR.
- Never weaken: the unauthenticated confidence cap, the web-front edition's inability to construct an Azure provider, the Safety
  Agent checks, the authorization gate and execution levels, Entra token validation on every appliance route, the refusal of
  client secrets, the "not production" labels.
- No secrets, tokens, customer inventories or real tenant/subscription IDs anywhere, including fixtures and tests. npm
  publishing is trusted publishing only (`docs/release/npm-publishing.md`); never add a registry token.
- Owner-pasteable commands: no placeholders; bash and PowerShell both acceptable.
- This repository holds the canonical ADR log for both repositories. Record material design choices as ADRs in `docs/adr/`
  (next number: 0029). Record limitations in `VALIDATION.md`.
- Docs for agents are generated: edit `packages/agents/src/definitions.ts`, then `node scripts/generate-agent-docs.mjs`.
