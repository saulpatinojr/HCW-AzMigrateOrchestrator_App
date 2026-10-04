# Azure Migration Orchestrator — appliance (`_App`)

One of two public repositories (ADR-0027):

| Repository | Holds |
|---|---|
| **`saulpatinojr/HCW-AzMigrateOrchestrator_App`** (this one) | The authenticated, read-only-by-default **Azure appliance**: API, web UI (MSAL), worker, Entra/credential helpers (`azure-auth`), Resource Graph / ARM validate-move / scope clients (`azure-arm`), gated Resource Mover client (`azure-execution`), Container Apps Terraform |
| `saulpatinojr/HCW-AzMigrateOrchestrator_Addon` | Shared migration intelligence core, rule corpus, `amo` CLI, CSV lab API and the `@amo/ui` explorer package. This repository consumes it at a pinned version |

*Sign-in, Resource Graph and Resource Mover are implemented against REST with fakes in tests; nothing here has been validated against a live tenant yet. See `VALIDATION.md`.*

## Quick start

The shared core is a sibling checkout at the pinned ref (interim contract until the npm packages exist):

```bash
npm run addon:bootstrap     # clones ../HCW-AzMigrateOrchestrator_Addon at the pinned ref and builds it
npm ci && npm test
npm run web:build
```

PowerShell: `bash scripts/bootstrap-addon.sh; npm ci; npm test; npm run web:build`

Local API with fixture discovery: copy `.env.example` to `.env`, set `AMO_DISCOVERY_FIXTURE=1`, then `npm run appliance:api`.

Container image: build from the **parent** directory that holds both checkouts: `docker build -f HCW-AzMigrateOrchestrator_App/infrastructure/docker/Dockerfile.appliance .` (see `docker-compose.appliance.yml`).

## Repository map

| Path | What |
|---|---|
| `packages/azure-auth` | Dependency-free Entra token validation (JWKS/RS256) and credentials (Azure CLI, managed identity, WIF); client secrets rejected |
| `packages/azure-arm` | Resource Graph discovery (paged, 403 → permission gap), ARM `validateMoveResources` evidence, subscription/Lighthouse scope inventory. Implements the core `DiscoveryProvider` interface |
| `packages/azure-execution` | Resource Mover client with gated prepare/initiateMove/commit/discard and operation polling |
| `apps/appliance-api` · `apps/worker` · `apps/appliance-web` | Token-validated API; long-running-operation poller; Vite + React + MSAL UI reusing `@amo/ui` |
| `infrastructure/terraform/appliance-azure` | Container Apps, user-assigned identity, PostgreSQL (Entra-only), Entra app registration (experimental template; the smaller `appliance-project` profile is Phase 4 of the working plan) |
| `docs/` | Appliance deployment and the appliance-relevant ADR copies; the canonical ADR log, ledger and `WORKING-PLAN.md` are in the core repository |

## Release contract

Deployments reference the image digest published by `publish-images.yml` (`ghcr.io/saulpatinojr/azure-migration-orchestrator-appliance`), never a tag. The core ref is `ADDON_REF` in `.github/workflows`; it changes only through a reviewed PR.

License: MIT (see `LICENSE`, `NOTICE`). Security: `SECURITY.md`.
