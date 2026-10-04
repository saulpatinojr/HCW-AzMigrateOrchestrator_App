# Azure Migration Orchestrator — appliance and migration intelligence core

The upstream product (ADR-0028). This repository holds the **appliance** — authenticated, read-only-by-default assessment of
real Azure estates with approval-gated planning — together with the engine it is built on: taxonomy, versioned
Microsoft-Learn-sourced rules, classification, 19 bounded agents, report / Terraform / runbook generators, the `amo` CLI and the
React explorer components. It builds and runs on its own.

| Repository | Role |
|---|---|
| **`saulpatinojr/HCW-AzMigrateOrchestrator_App`** (this one) | Upstream: engine, rules, CLI, UI components, appliance. Publishes `@hybridcloudworks/migration-core`, `@hybridcloudworks/migration-ui`, the CLI binaries and the appliance image |
| `saulpatinojr/HCW-AzMigrateOrchestrator_Addon` | Downstream: the slim web-front edition — CSV lab API and the hybridcloudworks.com explorer integration. Consumes the published packages at exact versions; receives updates through its `core-update` workflow when they pass its tests |

*Sign-in, Resource Graph and Resource Mover are implemented against REST with fakes in tests; nothing has been validated
against a live tenant yet. See `VALIDATION.md`.*

For every resource the engine answers: ARM move? Resource Mover? Azure Migrate or another service? ASR (DR only)? Database/data
mechanism? Recreate infrastructure? Migrate data separately? Rebuild identity/network/DNS/config? Or retain, retire, replace,
redesign, escalate — with evidence, missing information, confidence, prerequisites, risks, validation and rollback, and generated
Terraform/PowerShell/CLI/runbooks. "Unsupported" is never the final answer.

## Quick start

```bash
npm ci && npm test                       # build, assemble the publishable packages, run the tests
npm run rules:validate
npm run packages:verify                  # pack both packages and exercise them from an empty consumer project
node apps/cli/dist/main.js assess --csv samples/resources-csv/sample-resources.csv --out ./out --region westus3 --zip
npm run web:build                        # appliance web UI (Vite + React + MSAL)
docker compose -f docker-compose.appliance.yml up --build
```

PowerShell: `npm ci; npm test; npm run rules:validate; node apps/cli/dist/main.js assess --csv samples/resources-csv/sample-resources.csv --out .\out --region westus3 --zip`

Single executable (no Node at run time): `bash scripts/build-sea.sh` → `dist-sea/amo-<os>-<arch>` with a `SHA256SUMS-<os>-<arch>.txt` beside it. Release binaries for Linux, macOS and Windows are attached to every GitHub release.

## Repository map

| Path | What |
|---|---|
| `packages/domain` · `contracts` · `csv-ingestion` · `evidence-engine` · `rules/` | Taxonomy, API contracts, hardened `resources.csv` parser, versioned and checksummed rules |
| `packages/classification-engine` · `agents` · `{report,terraform,runbook,artifact}-*` | Decisions, confidence, waves; orchestrator and Safety Agent; the output bundle |
| `packages/authorization` · `workspace-provider` · `observability` · `azure-discovery` | Levels + approval gate, Coder abstraction, redacted logging, the `DiscoveryProvider` **interface** |
| `packages/ui` | The explorer components, published as `@hybridcloudworks/migration-ui` |
| `packages/azure-auth` · `azure-arm` · `azure-execution` | Entra token validation and credentials; Resource Graph / ARM validate-move / scope clients; gated Resource Mover. **Never published** |
| `apps/cli` · `apps/appliance-api` · `apps/appliance-web` · `apps/worker` | Entry points |
| `scripts/assemble-packages.mjs` · `dist-packages/` | Builds the two npm packages from the workspaces (`npm run build`) |
| `infrastructure/` | Appliance Dockerfile and Container Apps Terraform |
| `docs/` | Requirement ledger, traceability, canonical ADR log, agents, product, release runbooks, `WORKING-PLAN.md` |

Start with `WORKING-PLAN.md`, then `docs/requirements-ledger.md`, `docs/architecture/overview.md` and `VALIDATION.md`.

## Release contract

A `v*` tag publishes: the appliance image (built, scanned, then pushed with provenance and SBOM; deploy by digest), the CLI
binaries with checksums and provenance, and — once the owner has completed `docs/release/npm-publishing.md` — both npm packages
with provenance via trusted publishing. Nothing consumes `main`.

## Principles baked into code

Read-only default · the web-front edition is technically unable to reach Azure · infrastructure/identity/configuration/data
decided separately · migration ≠ DR (ASR is never a default migration tool) · unknown stays unknown · low evidence never yields
high confidence · every output labelled, hashed and traceable to rule versions · nothing generated is "production-ready" until validated.

License: MIT (see `LICENSE`, `NOTICE`). Security: `SECURITY.md`.
