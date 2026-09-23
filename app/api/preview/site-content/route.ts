import { PREVIEW_LIMITS, parsePreviewDocument } from "../../../preview-workspace/document";
import { PREVIEW_ORIGIN_HEADER, previewDatabase, requirePreviewWorkspace, validateNewPreviewAssetReferences } from "../../../preview-workspace/server";
import { PreviewStorageError, readPreviewDocument, savePreviewDocument } from "../../../preview-workspace/storage";

export const dynamic = "force-dynamic";
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store, private", "Vary": "Origin" } });
function failure(error: unknown) {
  if (error instanceof PreviewStorageError) return response({ error: error.message, code: error.code }, error.code === "conflict" ? 409 : 503);
  if (error instanceof Error && /^(新版内容字段不合法：|expectedRevision 不合法)/.test(error.message)) return response({ error: error.message }, 400);
  return response({ error: "新版本地服务暂时不可用，请稍后重试。" }, 503);
}
export async function GET(request: Request) {
  if (!(await requirePreviewWorkspace(request))) return response({ error: "本地新版工作区未启用。" }, 404);
  try { const snapshot = await readPreviewDocument(previewDatabase()); return response({ ...snapshot, configured: snapshot.content !== null }); } catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  if (!(await requirePreviewWorkspace(request))) return response({ error: "本地新版工作区未启用。" }, 404);
  if (request.headers.get("origin") !== request.headers.get(PREVIEW_ORIGIN_HEADER) || (request.headers.get("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) return response({ error: "保存必须来自同源本地新版后台。" }, 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return response({ error: "保存必须使用 JSON。" }, 415);
  if (Number(request.headers.get("content-length")) > PREVIEW_LIMITS.bytes) return response({ error: "请求超过 512 KB。" }, 413);
  try {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    if (reader) while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > PREVIEW_LIMITS.bytes) { await reader.cancel(); return response({ error: "请求超过 512 KB。" }, 413); } chunks.push(part.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let payload; try { payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return response({ error: "请求不是有效的 JSON。" }, 400); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).sort().join() !== "content,expectedRevision") return response({ error: "请求只能包含 content 和 expectedRevision。" }, 400);
    const content = parsePreviewDocument(payload.content);
    const db = previewDatabase();
    const current = await readPreviewDocument(db);
    if (current.revision !== payload.expectedRevision) throw new PreviewStorageError("conflict");
    await validateNewPreviewAssetReferences(content, current.content);
    return response({ ...await savePreviewDocument(db, content, payload.expectedRevision), configured: true });
  } catch (error) { return failure(error); }
}
