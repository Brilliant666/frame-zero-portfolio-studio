import { createHealthResponse } from "../health-response";
import { getAccountRuntime } from "../../../../db/accounts/http.mjs";
import { checkRuntimeReadiness } from "../../../../db/accounts/health.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function readyResponse(head = false) {
  if (process.env.FRAME_ZERO_PRODUCTION_SITE !== "1") return createHealthResponse("ready", head);
  let ready = false;
  try { ready = await checkRuntimeReadiness(getAccountRuntime()); } catch { /* Fail closed without exposing configuration. */ }
  return new Response(head ? null : JSON.stringify({ status: ready ? "ready" : "not_ready" }), {
    status: ready ? 200 : 503,
    headers: { "cache-control": "no-store", "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" },
  });
}

export const GET = () => readyResponse();
export const HEAD = () => readyResponse(true);
