import { createHealthResponse } from "../health-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return createHealthResponse("ready");
}

export function HEAD() {
  return createHealthResponse("ready", true);
}
