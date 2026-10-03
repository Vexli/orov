// Skeleton for the long-running worker (plan.md §3). Jobs are added in Phase 4 on pg-boss,
// and Slack Socket Mode in Phase 5. For now the worker only logs a heartbeat, so the
// container can be deployed and watched from the start.

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
