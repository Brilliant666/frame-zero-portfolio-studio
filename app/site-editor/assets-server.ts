import { accountJson } from "../../db/accounts/http.mjs";
import { AssetError, UUID, siteAssetDto as assetDto, readAssetVariant, uploadAsset } from "../../db/accounts/assets.mjs";
import { authorizeEditor } from "./server";

export async function handleAssetsRequest(request: Request, slug: string, id?: string, variant?: string) {
  const auth = await authorizeEditor(request, slug, "basic");
  if ("denied" in auth) return accountJson({ error: "站点资源不可访问" }, auth.denied);
  const { runtime, account } = auth;
  try {
    if (id) {
      if (!UUID.test(id) || !["GET", "HEAD"].includes(request.method)) return accountJson({ error: "NOT_FOUND" }, 404);
      const result = await runtime.pool.query("SELECT * FROM site_assets WHERE site_id=$1 AND id=$2", [account.site.id, id]);
      if (!result.rowCount) return accountJson({ error: "NOT_FOUND" }, 404);
      if (!variant) return accountJson({ asset: assetDto(result.rows[0], slug) });
      if (request.headers.has("range")) return accountJson({ error: "RANGE_NOT_SUPPORTED" }, 416);
      const file = await readAssetVariant(result.rows[0], variant);
      return new Response(request.method === "HEAD" ? null : new Uint8Array(file.bytes), { headers: {
        "Content-Type": file.type, "Content-Length": String(file.bytes.length), "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Accept-Ranges": "none",
      } });
    }
    if (request.method === "GET") {
      const result = await runtime.pool.query("SELECT * FROM site_assets WHERE site_id=$1 ORDER BY created_at,id LIMIT 10001", [account.site.id]);
      return accountJson({ version: 1, truncated: result.rows.length > 10000, assets: result.rows.slice(0, 10000).map((row: Parameters<typeof assetDto>[0]) => assetDto(row, slug)) });
    }
    if (request.method === "POST") {
      const result = await uploadAsset(request, runtime.pool, account.site.id);
      return accountJson({ asset: assetDto(result.row, slug), deduplicated: !result.created }, result.created ? 201 : 200);
    }
    return accountJson({ error: "METHOD_NOT_ALLOWED" }, 405);
  } catch (error) {
    return accountJson({ error: error instanceof AssetError ? error.message : "资源服务暂不可用" }, error instanceof AssetError ? error.status : 503);
  }
}
