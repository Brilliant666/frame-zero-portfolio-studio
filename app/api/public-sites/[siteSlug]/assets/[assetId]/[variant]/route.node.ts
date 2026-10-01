import { accountJson, accountRequestAllowed, getAccountRuntime } from "../../../../../../../db/accounts/http.mjs";
import { readPublished, readPublishedAssets } from "../../../../../../../db/accounts/publications.mjs";
import { isSiteSlug } from "../../../../../../../db/accounts/site-slug.mjs";
import { UUID, readAssetVariant } from "../../../../../../../db/accounts/assets.mjs";
import { publicAssetResponse } from "../../../../../../../db/accounts/public-asset-response.mjs";
export const dynamic = "force-dynamic";
async function serve(request: Request, context: { params: Promise<{ siteSlug: string; assetId: string; variant: string }> }) {
  const { siteSlug, assetId, variant } = await context.params;
  if (!isSiteSlug(siteSlug) || !UUID.test(assetId) || !["thumbnail", "card", "full"].includes(variant)) return accountJson({ error: "NOT_FOUND" }, 404);
  try {
    const runtime = getAccountRuntime();
    if (!accountRequestAllowed(request, runtime.config)) return accountJson({ error: "NOT_FOUND" }, 404);
    const snapshot = await readPublished(runtime.pool, siteSlug);
    if (!snapshot?.assetIds.includes(assetId)) return accountJson({ error: "NOT_FOUND" }, 404);
    const rows = await readPublishedAssets(runtime.pool, snapshot);
    const row = rows.find((item: { id: string }) => item.id === assetId);
    if (!row) return accountJson({ error: "NOT_FOUND" }, 404);
    if (request.headers.has("range")) return accountJson({ error: "RANGE_NOT_SUPPORTED" }, 416);
    const file = await readAssetVariant(row, variant);
    return publicAssetResponse(request, file);
  } catch { return accountJson({ error: "资源暂不可用" }, 503); }
}
export const GET = serve;
export const HEAD = serve;
