import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { getLegacyD1Database } from "../../db";
import { readPreviewDocument, type PreviewDatabase } from "./storage";
import { type PreviewPortfolioDocumentV1 } from "./document";

export const PREVIEW_PROOF_HEADER = "x-frame-zero-preview-proof";
export const PREVIEW_ORIGIN_HEADER = "x-frame-zero-preview-origin";
export async function requirePreviewWorkspace(request?: Request): Promise<boolean> {
  const secret = (env as Record<string, unknown>).FRAME_ZERO_PREVIEW_WORKSPACE_SECRET;
  if (typeof secret !== "string" || secret.length < 48) return false;
  const h = request ? request.headers : await headers();
  const source = h.get("sec-fetch-site");
  if (source && source !== "none" && source !== "same-origin") return false;
  if (h.get("origin") && h.get("origin") !== h.get(PREVIEW_ORIGIN_HEADER)) return false;
  return h.get(PREVIEW_PROOF_HEADER) === secret && /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):3001$/.test(h.get(PREVIEW_ORIGIN_HEADER) ?? "");
}
export function previewDatabase(): PreviewDatabase { return getLegacyD1Database() as unknown as PreviewDatabase; }
export async function readSavedPreviewDocument() { return readPreviewDocument(previewDatabase()); }
export async function validateNewPreviewAssetReferences(document: PreviewPortfolioDocumentV1, previous: PreviewPortfolioDocumentV1 | null) {
  const refs = (d: PreviewPortfolioDocumentV1 | null) => new Set(d?.collections.flatMap((c) => [...c.assetIds, ...(c.coverAssetId ? [c.coverAssetId] : []), ...(c.focusAssetId ? [c.focusAssetId] : [])]) ?? []);
  const old = refs(previous);
  const added = [...refs(document)].filter((id) => !old.has(id));
  if (!added.length) return;
  const origin = (env as Record<string, unknown>).FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN;
  if (typeof origin !== "string" || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(origin)) throw new Error("素材库暂时不可用。");
  const response = await fetch(`${origin}/library`, { headers: { Origin: "http://127.0.0.1:3001" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error("素材库暂时不可用。");
  const snapshot = await response.json() as { ok?: boolean; items?: Array<{ assetId: string; status: string }> };
  if (!snapshot.ok || !Array.isArray(snapshot.items) || snapshot.items.some((x) => typeof x.assetId !== "string" || !["active", "archived"].includes(x.status))) throw new Error("素材库暂时不可用。");
  const active = new Set(snapshot.items.filter((x) => x.status === "active").map((x) => x.assetId));
  if (added.some((id) => !active.has(id))) throw new Error("新版内容字段不合法：新增照片必须是共享素材库中可用的素材；已有缺失引用可以保留。");
}
