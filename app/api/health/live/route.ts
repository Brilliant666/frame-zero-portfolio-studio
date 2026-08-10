import { createHealthResponse } from "../health-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return createHealthResponse("live");
}

export function HEAD() {
  return createHealthResponse("live", true);
}
