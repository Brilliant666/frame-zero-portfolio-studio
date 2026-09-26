import { accountRequestAllowed, accountJson, getAccountRuntime, readSiteForPrincipal } from "../../db/accounts/http.mjs";
import { isSiteSlug } from "../../db/accounts/site-slug.mjs";
import { createEmptyPreviewDocument } from "../preview-workspace/document";
import { createEmptyBasicContent, isContentSpace, parseSpaceContent, UnconnectedAssetError, type ContentSpace } from "./content-schema";

export async function authorizeEditor(request: Request, slug: string, space: string) {
  if (!isSiteSlug(slug) || !isContentSpace(space)) return { denied: 404 as const };
  if (process.env.FRAME_ZERO_ACCOUNT_NODE_RUNTIME !== "1" || process.env.FRAME_ZERO_LOCAL_ACCOUNTS !== "1") return { denied: 404 as const };
  try {
    const runtime = getAccountRuntime();
    if (!accountRequestAllowed(request, runtime.config) || new URL(request.url).search) return { denied: 403 as const };
    const session = await runtime.auth.api.getSession({ headers: request.headers });
    if (!session) return { denied: 401 as const };
    const account = await readSiteForPrincipal(runtime, session.user, null, slug);
    if (!account || (space === "premium-polaroid" && !account.templates.premium.includes(space))) return { denied: 403 as const };
    return { runtime, account, userId: session.user.id, space: space as ContentSpace };
  } catch { return { denied: 503 as const }; }
}

// Ownership and grant are repeated in the database operation itself. Neither a
// client siteId nor a previously authorized page can select the write scope.
const ownership = `EXISTS (SELECT 1 FROM sites s JOIN portfolio_users p ON p.id=s.owner_id
 JOIN account_provisioning op ON op.id=p.provisioning_id AND op.completed_at IS NOT NULL
 WHERE s.id=$1::uuid AND p.auth_user_id=$3::uuid
 AND ($2='basic' OR EXISTS (SELECT 1 FROM site_template_grants g WHERE g.site_id=s.id AND g.product=$2)))`;

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
        content: space === "basic" ? createEmptyBasicContent() : createEmptyPreviewDocument(), revision: 0, updatedAt: null,
      });
    }
    if (request.method !== "PUT") return accountJson({ error: "METHOD_NOT_ALLOWED" }, 405);
    if (!(request.headers.get("content-type") ?? "").startsWith("application/json")) return accountJson({ error: "INVALID_CONTENT_TYPE" }, 415);
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > 512_000) return accountJson({ error: "内容超过限制" }, 413);
    let payload, content;
    try {
      payload = JSON.parse(raw);
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some(k => !["content", "expectedRevision"].includes(k)) || !Number.isSafeInteger(payload.expectedRevision) || payload.expectedRevision < 0 || payload.expectedRevision >= 2147483647) throw new Error("无效版本");
      content = parseSpaceContent(auth.space, payload.content);
    } catch (error) {
      return accountJson({ error: error instanceof UnconnectedAssetError ? error.message : "内容或版本不合法，未保存" }, error instanceof UnconnectedAssetError ? 422 : 400);
    }
    const expected = payload.expectedRevision;
    const result = expected === 0
      ? await runtime.pool.query(`INSERT INTO site_content_drafts(site_id,space,content,revision)
          SELECT $1::uuid,$2,$4::jsonb,1 WHERE ${ownership}
          ON CONFLICT (site_id,space) DO NOTHING RETURNING content,revision,updated_at`, [...scope, JSON.stringify(content)])
      : await runtime.pool.query(`UPDATE site_content_drafts SET content=$4::jsonb,revision=revision+1,updated_at=now()
          WHERE site_id=$1::uuid AND space=$2 AND revision=$5 AND ${ownership}
          RETURNING content,revision,updated_at`, [...scope, JSON.stringify(content), expected]);
    if (!result.rowCount) return accountJson({ error: "版本冲突或授权已变化，当前草稿保留；请导出或核对后重新读取。" }, 409);
    const row = result.rows[0];
    return accountJson({ content: row.content, revision: row.revision, updatedAt: row.updated_at });
  } catch { return accountJson({ error: "草稿服务暂不可用，当前修改未丢弃" }, 503); }
}
