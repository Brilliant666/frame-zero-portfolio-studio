export type HealthStatus = "live" | "ready";

const HEALTH_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
});

export function createHealthResponse(status: HealthStatus, head = false) {
  return new Response(head ? null : JSON.stringify({ status }), {
    headers: HEALTH_HEADERS,
    status: 200,
  });
}
