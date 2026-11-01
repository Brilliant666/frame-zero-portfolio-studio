import { setTimeout as delay } from "node:timers/promises";

// A referenced timer both bounds an individual fetch and keeps Node alive when
// its HTTP client has only unreferenced handles during container startup.
async function probeReady(url, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("Container readiness probe timed out."));
      controller.abort();
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([
      Promise.resolve().then(() => fetchImpl(url, { cache: "no-store", signal: controller.signal })),
      timeout,
    ]);
    const ready = response.status === 200;
    // Probe bodies are unused. Do not leave a response occupying the connection.
    if (response.body) void response.body.cancel().catch(() => {});
    return ready;
  } finally { clearTimeout(timer); }
}

export async function waitForContainerReady(origin, {
  timeoutMs = 45_000,
  probeTimeoutMs = 2_000,
  intervalMs = 200,
  fetchImpl = fetch,
  readLogs = async () => "<logs unavailable>",
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await probeReady(`${origin}/api/health/ready`, Math.max(1, Math.min(probeTimeoutMs, deadline - Date.now())), fetchImpl)) return;
    } catch (error) { lastError = error; }
    const remaining = deadline - Date.now();
    if (remaining > 0) await delay(Math.min(intervalMs, remaining));
  }
  const logs = await readLogs().catch(() => "<logs unavailable>");
  throw new Error(`Container did not become ready.\n${logs}`, { cause: lastError });
}
