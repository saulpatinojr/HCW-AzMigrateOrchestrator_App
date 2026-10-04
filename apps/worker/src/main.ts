import { configFromEnv, depsFromEnv, repositoryFromEnv } from "@amo/appliance-api";
import { createLogger } from "@amo/observability";
import { runForever } from "./index.js";
const cfg = configFromEnv();
const deps = depsFromEnv(cfg);
if (!deps.credential) { console.error("worker requires an Azure credential (AMO_ENTRA_TENANT_ID + AMO_CREDENTIAL_KIND)"); process.exit(2); }
const repository = await repositoryFromEnv(process.env, deps.credential);
const ac = new AbortController();
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => ac.abort());
await runForever({ repository, credential: deps.credential, logger: createLogger({ app: "worker" }) }, Number(process.env.AMO_WORKER_INTERVAL_MS ?? 15000), ac.signal);
