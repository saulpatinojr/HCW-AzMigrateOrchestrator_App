# Appliance deployment (Azure)

Sprint 3 made the appliance a working, fail-closed service (ADR-0022). The Azure SDK is not used; all Azure calls are REST
with dependency-free credentials.

## 1. Provision

```bash
export ARM_SUBSCRIPTION_ID=...   # hosting subscription; authenticate with az login (no secrets)
cd infrastructure/terraform/appliance-azure && cp terraform.tfvars.example terraform.tfvars
terraform init && terraform plan -out appliance.plan && terraform apply appliance.plan
```

Creates: resource group, user-assigned identity (Reader on `assessment_scope_ids`), VNet + delegated subnets, PostgreSQL
Flexible Server (private, **Entra-only auth**, the identity is the DB admin), Log Analytics + App Insights, Container Apps
environment + app, Entra app registration with app roles. Follow the `post_apply` output (identifier URI, role assignments).

## 2. Authentication model

| Role | Level | Can |
|---|---|---|
| (signed in, no role) | discovery | run discovery assessments on permitted scopes |
| `Migration.Plan` | planning | + validate-move evidence, plans, bundles |
| `Migration.Execute` | controlled-execution | + record approvals; Resource Mover prepare / initiateMove (approval `production-deploy`) / discard |
| `Migration.Execute.Destructive` | destructive-execution | + commit (approval `data-cutover`), source deletion workflows (future) |

Tokens: authorization-code flow with PKCE in the client; the API validates audience `api://<client_id>` against the tenant
JWKS. Credentials for Azure calls: managed identity in Container Apps (`AMO_CREDENTIAL_KIND=managed-identity`), workload
identity federation in CI, Azure CLI for local development. `AMO_*SECRET` / `AZURE_*SECRET` variables abort startup.

## 2b. Web UI

`apps/appliance-web` (Vite + React + MSAL). Register a **second**, public-client SPA app registration with redirect URI
`https://<web-host>/`, expose the API's `access_as_user` scope on the API registration, and pre-authorize the SPA. Build with
`VITE_ENTRA_TENANT_ID`, `VITE_ENTRA_SPA_CLIENT_ID`, `VITE_API_SCOPE`, `VITE_API_BASE_URL` (all public values) and host the
`dist/` on Static Web Apps or a second Container App. Add the web origin to the API's allowed origins when hosted separately.

## 2c. Worker

`ca-<name>-worker` runs `node apps/worker/dist/main.js` from the same image with the same identity, polling Azure long-running
operations recorded by the API and auditing their completion (ADR-0026). Locally: the `worker` service in
`docker-compose.appliance.yml`.

## 3. API surface

`GET /api/health` · `GET /api/me` · `GET /api/scopes` (subscriptions incl. Lighthouse-delegated) · `POST /api/assessments {scope:{kind,id}, intent, destinationSubscriptionId?}` · `GET /api/assessments` ·
`GET /api/assessments/{id}` · `POST /api/assessments/{id}/validate-move {targetResourceGroupId}` ·
`POST /api/approvals {operation,targetKey,note}` · `POST /api/execution/resource-mover/{prepare|initiateMove|commit|discard}` (returns `operationId`) · `GET /api/operations/{targetKey}`.

Every state-changing call is audited (`audit_events`). Execution RBAC for Resource Mover (Contributor on source and target
resource groups) is granted **per engagement** and removed afterwards; the base Terraform grants Reader only.

## 4. Local development

`docker compose -f docker-compose.appliance.yml up --build` with `AMO_DISCOVERY_FIXTURE=1` (no Azure) or
`AMO_CREDENTIAL_KIND=azure-cli` with `~/.azure` mounted. Without `AMO_ENTRA_TENANT_ID`/`CLIENT_ID` every protected route
returns 401 by design.

## 5. Not yet validated against a real tenant

JWKS fetch, Resource Graph paging, `validateMoveResources` polling, Resource Mover API shapes ([VERIFY] 2023-08-01 request
bodies), PostgreSQL Entra token exchange at connect time (implemented as a `pg` password provider, ADR-0025; untested live). All are exercised against fakes in the test suite.
