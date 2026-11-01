import { accountRuntimeEnabled, accountRequestAllowed, accountJson, getAccountRuntime, readSiteForPrincipal } from "../../db/accounts/http.mjs";
import { JSON_BODY_LIMITS, readBoundedText, RequestBodyError } from "../../db/accounts/request-body.mjs";
import { isSiteSlug } from "../../db/accounts/site-slug.mjs";
import { draftOwnership as ownership, writeOwnedDraft } from "../../db/accounts/draft-write.mjs";
import { createEmptyPreviewDocument } from "../preview-workspace/document";
import { createEmptyFlowGalleryDocument } from "./flow-gallery-document";
import { createEmptyBasicContent, isContentSpace, parseSpaceContent, contentAssetIds, UnconnectedAssetError, type ContentSpace } from "./content-schema";

export async function authorizeEditor(request: Request, slug: string, space: string) {
  if (!isSiteSlug(slug) || !isContentSpace(space)) return { denied: 404 as const };
  if (!accountRuntimeEnabled()) return { denied: 404 as const };
  try {
    const runtime = getAccountRuntime();
    if (!accountRequestAllowed(request, runtime.config) || new URL(request.url).search) return { denied: 403 as const };
    const session = await runtime.auth.api.getSession({ headers: request.headers });
    if (!session) return { denied: 401 as const };
    const account = await readSiteForPrincipal(runtime, session.user, null, slug);
    if (!account || (space !== "basic" && !account.templates.premium.includes(space))) return { denied: 403 as const };
    return { runtime, account, userId: session.user.id, space: space as ContentSpace };
  } catch { return { denied: 503 as const }; }
}

export async function handleDraftRequest(request: Request, slug: string, space: string) {
  const auth = await authorizeEditor(request, slug, space);
  if ("denied" in auth) return accountJson({ error: "站点或内容空间不可访问" }, auth.denied);
  const { runtime, account, userId } = auth;
  const scope = [account.site.id, space, userId];
  try {
    if (request.method === "GET") {
      const result = await runtime.pool.query(`SELECT d.content,d.revision,d.updated_at FROM site_content_drafts d
        WHERE d.site_id=$1::uuid AND d.space=$2 AND ${ownership}`, scope);
      const row = result.rows[0];
      return accountJson(row ? { content: row.content, revision: row.revision, updatedAt: row.updated_at } : {
        content: space === "basic" ? createEmptyBasicContent() : space === "premium-flow-gallery" ? createEmptyFlowGalleryDocument() : createEmptyPreviewDocument(), revision: 0, updatedAt: null,
      });
    }
    if (request.method !== "PUT") return accountJson({ error: "METHOD_NOT_ALLOWED" }, 405);
    if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) return accountJson({ error: "INVALID_CONTENT_TYPE" }, 415);
    const raw = await readBoundedText(request, { maximum: JSON_BODY_LIMITS.draft });
    let payload, content;
    try {
      payload = JSON.parse(raw);
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some(k => !["content", "expectedRevision"].includes(k)) || !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0 || payload.expectedRevision >= 2147483647) throw new Error("无效版本");
      content = parseSpaceContent(auth.space, payload.content);
    } catch (error) {
      return accountJson({ error: error instanceof UnconnectedAssetError ? error.message : "内容或版本不合法，未保存" }, error instanceof UnconnectedAssetError ? 422 : 400);
    }
    const expected = payload.expectedRevision;
    const ids = contentAssetIds(auth.space, content);
    if (ids.length) {
      const owned = await runtime.pool.query("SELECT id FROM site_assets WHERE site_id=$1 AND id=ANY($2::uuid[])", [account.site.id, ids]);
      if (owned.rowCount !== ids.length) return accountJson({ error: "资源不存在或不属于当前站点，未保存" }, 422);
    }
    const result = await writeOwnedDraft(runtime.pool, { siteId: account.site.id, space, userId, content, expectedRevision: expected });
    if (!result.rowCount) return accountJson({ error: "版本冲突或授权已变化，当前草稿保留；请导出或核对后重新读取。" }, 409);
    const row = result.rows[0];
    return accountJson({ content: row.content, revision: row.revision, updatedAt: row.updated_at });
  } catch (error) {
    return accountJson({ error: error instanceof RequestBodyError ? error.message : "草稿服务暂不可用，当前修改未丢弃" }, error instanceof RequestBodyError ? error.status : 503);
  }
}
