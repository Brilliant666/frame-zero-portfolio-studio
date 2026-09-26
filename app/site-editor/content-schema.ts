import { isTemplateId, templateCatalog, type SiteContent } from "../site-config";
import { createEmptyPreviewDocument, parsePreviewDocument, type PreviewPortfolioDocumentV1 } from "../preview-workspace/document";

export type ContentSpace = "basic" | "premium-polaroid";
export function isContentSpace(value: string): value is ContentSpace { return value === "basic" || value === "premium-polaroid"; }
export function createEmptyBasicContent(): SiteContent {
  const { schemaVersion: _schema, collections: _collections, ...basics } = createEmptyPreviewDocument();
  void _schema; void _collections;
  return { ...basics, activeTemplate: "cinematic-light", works: [], templateWorks: Object.fromEntries(templateCatalog.map(t => [t.id, []])) };
}
export class UnconnectedAssetError extends Error {}
function assertNoAssets(document: PreviewPortfolioDocumentV1) {
  if (document.social.some(s => s.qrAssetId) || document.collections.some(c => c.assetIds.length || c.coverAssetId || c.focusAssetId)) {
    throw new UnconnectedAssetError("Site 素材尚未接线，不能保存未经归属验证的素材引用。");
  }
}
export function parseSpaceContent(space: ContentSpace, value: unknown): SiteContent | PreviewPortfolioDocumentV1 {
  if (space === "premium-polaroid") {
    const document = parsePreviewDocument(value);
    assertNoAssets(document);
    return document;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("基础内容格式错误");
  const raw = value as Record<string, unknown>;
  const { activeTemplate, works, templateWorks, ...basics } = raw;
  if (typeof activeTemplate !== "string" || !isTemplateId(activeTemplate)) throw new Error("未知基础模板");
  if (!Array.isArray(works) || !templateWorks || typeof templateWorks !== "object" || Array.isArray(templateWorks)) throw new Error("基础作品格式错误");
  for (const [id, entries] of Object.entries(templateWorks)) {
    if (!isTemplateId(id) || !Array.isArray(entries)) throw new Error("模板作品格式错误");
    if (entries.length) throw new UnconnectedAssetError("Site 素材尚未接线");
  }
  if (works.length) throw new UnconnectedAssetError("Site 素材尚未接线");
  // Reuse strict field validation, not legacy normalization/default injection.
  // Reject the other space's schema markers before constructing the adapter.
  if ("schemaVersion" in basics || "collections" in basics) throw new Error("内容空间 schema 不匹配");
  const parsed = parsePreviewDocument({ ...basics, schemaVersion: 1, collections: [] });
  assertNoAssets(parsed);
  const { schemaVersion: _schema, collections: _collections, ...validated } = parsed;
  void _schema; void _collections;
  return { ...validated, activeTemplate, works: [], templateWorks: structuredClone(templateWorks) as SiteContent["templateWorks"] };
}
