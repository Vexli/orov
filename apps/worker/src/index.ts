// Skeleton for the long-running worker (plan.md §3, docs/integrations/). Scheduled integration
// jobs are added on pg-boss, and a live listener for messaging providers that offer one. For now
// the worker checks the integration settings and then only logs a heartbeat, so the container can
// be deployed and watched from the start.

import {
  describeIntegrations,
  IntegrationConfigError,
  loadIntegrations,
  type Integrations,
} from "@orov/integrations";

const HEARTBEAT_MS = 60_000;

function log(entry: Record<string, unknown>) {
  console.log(JSON.stringify({ ...entry, at: new Date().toISOString() }));
}

// A misconfigured provider stops the worker at startup, not at its first scheduled job.
function loadOrExit(): Integrations {
  try {
    return loadIntegrations(process.env);
  } catch (error) {
    if (!(error instanceof IntegrationConfigError)) throw error;
    log({ level: "error", msg: "integration settings are invalid", error: error.message });
    process.exit(1);
  }
}

const integrations = loadOrExit();
log({ level: "info", msg: "worker starting", integrations: describeIntegrations(integrations) });

function heartbeat() {
  log({ level: "info", msg: "worker heartbeat" });
}

heartbeat();
setInterval(heartbeat, HEARTBEAT_MS);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    log({ level: "info", msg: "worker stopping", signal });
    process.exit(0);
  });
}
