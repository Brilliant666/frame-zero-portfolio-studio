import { normalizePlatformQrAssetId } from "../../../platform-qr";
import { getLocalEditingServiceOrigin } from "../../../platform-qr-server";

export const dynamic = "force-dynamic";

async function proxyPlatformQr(
  params: Promise<{ assetId: string }>,
  includeBody: boolean,
) {
  const assetId = normalizePlatformQrAssetId((await params).assetId);
  const origin = getLocalEditingServiceOrigin();
  if (!assetId || !origin) return new Response(null, { status: 404 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const upstream = await fetch(`${origin}/platform-qr/${assetId}`, {
      cache: "no-store",
      method: includeBody ? "GET" : "HEAD",
      signal: controller.signal,
    });
    if (!upstream.ok || upstream.headers.get("content-type") !== "image/png") {
      await upstream.body?.cancel();
      return new Response(null, { status: upstream.status === 404 ? 404 : 502 });
    }
    const headers = new Headers({
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": "image/png",
      "x-content-type-options": "nosniff",
    });
    const length = upstream.headers.get("content-length");
    if (length) headers.set("content-length", length);
    const body = includeBody ? await upstream.arrayBuffer() : null;
    return new Response(body, { status: 200, headers });
  } catch {
    return new Response(null, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  return proxyPlatformQr(params, true);
}

export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  return proxyPlatformQr(params, false);
}
