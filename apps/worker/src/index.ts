// Skeleton for the long-running worker (plan.md §3, docs/integrations/). Scheduled integration
// jobs are added on pg-boss, and a live listener for messaging providers that offer one. For now
// the worker only logs a heartbeat, so the container can be deployed and watched from the start.

const HEARTBEAT_MS = 60_000;

function heartbeat() {
  console.log(JSON.stringify({ level: "info", msg: "worker heartbeat", at: new Date().toISOString() }));
}

heartbeat();
setInterval(heartbeat, HEARTBEAT_MS);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(JSON.stringify({ level: "info", msg: "worker stopping", signal }));
    process.exit(0);
  });
}
