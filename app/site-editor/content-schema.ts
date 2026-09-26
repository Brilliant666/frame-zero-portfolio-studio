import { isTemplateId, templateCatalog, type SiteContent } from "../site-config";
import { parsePreviewDocument, type PreviewPortfolioDocumentV1 } from "../preview-workspace/document";

export type ContentSpace = "basic" | "premium-polaroid";
export function isContentSpace(value: string): value is ContentSpace { return value === "basic" || value === "premium-polaroid"; }
export function createEmptyBasicContent(): SiteContent {
  return {
    activeTemplate: "cinematic-light", works: [], templateWorks: Object.fromEntries(templateCatalog.map(t => [t.id, []])),
    profile: { brand: "", mark: "", photographer: "", role: "", city: "", availability: "", intro: "" },
    hero: { eyebrow: "", title: "", services: "" }, trustItems: [], packages: [],
    contact: { wechat: "", email: "", note: "" }, social: [], bookingFields: [],
    statement: { eyebrow: "", lineOne: "", lineTwo: "" },
  };
}
export class UnconnectedAssetError extends Error {}
// The basic contract owns its field set and limits. Premium schema evolution
// must not add mandatory fields or change defaults in the eleven-template editor.
function basicRecord(value: unknown, keys: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("基础内容字段格式错误");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some(key => !keys.includes(key)) || keys.some(key => !optional.includes(key) && !Object.hasOwn(record, key))) throw new Error("基础内容字段不匹配");
  return record;
}
function basicText(value: unknown, max = 2000): string {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || /(?:data:[^;]*;base64,|file:\/\/|(?:^|\s)[A-Za-z]:[\\/])/.test(value)) throw new Error("基础文本字段不合法");
  return value;
}
function basicFields<K extends string>(value: unknown, keys: K[]): Record<K, string> {
  const record = basicRecord(value, keys);
  return Object.fromEntries(keys.map(key => [key, basicText(record[key])])) as Record<K, string>;
}
function basicList(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error("基础列表字段不合法");
  return value;
}
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
  const raw = basicRecord(value, ["activeTemplate", "profile", "hero", "trustItems", "works", "templateWorks", "packages", "contact", "social", "bookingFields", "statement"]);
  const { activeTemplate, works, templateWorks } = raw;
  if (typeof activeTemplate !== "string" || !isTemplateId(activeTemplate)) throw new Error("未知基础模板");
  if (!Array.isArray(works) || !templateWorks || typeof templateWorks !== "object" || Array.isArray(templateWorks)) throw new Error("基础作品格式错误");
  for (const [id, entries] of Object.entries(templateWorks)) {
    if (!isTemplateId(id) || !Array.isArray(entries)) throw new Error("模板作品格式错误");
    if (entries.length) throw new UnconnectedAssetError("Site 素材尚未接线");
  }
  if (works.length) throw new UnconnectedAssetError("Site 素材尚未接线");
  const content: SiteContent = {
    activeTemplate, works: [], templateWorks: structuredClone(templateWorks) as SiteContent["templateWorks"],
    profile: basicFields(raw.profile, ["brand", "mark", "photographer", "role", "city", "availability", "intro"]),
    hero: basicFields(raw.hero, ["eyebrow", "title", "services"]),
    contact: basicFields(raw.contact, ["wechat", "email", "note"]),
    statement: basicFields(raw.statement, ["eyebrow", "lineOne", "lineTwo"]),
    trustItems: basicList(raw.trustItems, 20).map(item => basicFields(item, ["label", "value"])),
    packages: basicList(raw.packages, 30).map(item => {
      const p = basicRecord(item, ["number", "english", "name", "description", "price", "duration", "deliverables", "enabled"]);
      if (typeof p.enabled !== "boolean") throw new Error("基础套餐启用状态不合法");
      return { number: basicText(p.number), english: basicText(p.english), name: basicText(p.name), description: basicText(p.description), price: basicText(p.price), duration: basicText(p.duration), enabled: p.enabled, deliverables: basicList(p.deliverables, 30).map(v => basicText(v)) };
    }),
    social: basicList(raw.social, 20).map(item => {
      const s = basicRecord(item, ["label", "handle", "qrAssetId"], ["qrAssetId"]);
      if (s.qrAssetId !== undefined) {
        if (typeof s.qrAssetId !== "string" || !/^[a-f0-9]{64}$/.test(s.qrAssetId)) throw new Error("基础平台卡字段不合法");
        throw new UnconnectedAssetError("Site 素材尚未接线");
      }
      return { label: basicText(s.label, 100), handle: basicText(s.handle) };
    }),
    bookingFields: basicList(raw.bookingFields, 40).map(v => basicText(v, 200)),
  };
  if (new TextEncoder().encode(JSON.stringify(content)).byteLength > 512_000) throw new Error("基础内容超过 512 KB");
  return content;
}
