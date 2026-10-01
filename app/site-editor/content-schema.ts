import { isTemplateId, templateCatalog, type SiteContent, type Work } from "../site-config";
import { parsePreviewDocument, type PreviewPortfolioDocumentV1 } from "../preview-workspace/document";
import { parseFlowGalleryDocument, type FlowGalleryDocumentV1 } from "./flow-gallery-document";

export type ContentSpace = "basic" | "premium-polaroid" | "premium-flow-gallery";
export type SpaceContent = SiteContent | PreviewPortfolioDocumentV1 | FlowGalleryDocumentV1;
export function isContentSpace(value: string): value is ContentSpace { return value === "basic" || value === "premium-polaroid" || value === "premium-flow-gallery"; }
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
const SITE_ASSET = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function siteAsset(value: unknown): string {
  if (typeof value !== "string" || !SITE_ASSET.test(value)) throw new Error("Site 资源身份不合法");
  return value;
}
export function parseSitePremiumDocument(value: unknown): PreviewPortfolioDocumentV1 {
  // Reuse the unchanged legacy structure parser, but validate Site card IDs
  // separately. Do not teach the global legacy parser to accept hosted URLs.
  const raw = value as PreviewPortfolioDocumentV1;
  if (!raw || !Array.isArray(raw.social)) throw new Error("平台卡格式错误");
  const social = raw.social.map(s => {
    if (s.qrAssetId !== undefined) siteAsset(s.qrAssetId);
    return s;
  });
  const parsed = parsePreviewDocument({ ...raw, social: social.map(s => ({ ...s, ...(s.qrAssetId ? { qrAssetId: "0".repeat(64) } : {}) })) });
  parsed.social = parsed.social.map((s, i) => ({ ...s, ...(social[i].qrAssetId ? { qrAssetId: social[i].qrAssetId } : {}) }));
  for (const c of parsed.collections) for (const id of [...c.assetIds, c.coverAssetId, c.focusAssetId]) if (id) siteAsset(id);
  return parsed;
}
function parseWork(value: unknown): Work {
  const w = basicRecord(value, ["assetId", "slotIndex", "locked", "code", "title", "subtitle", "image", "preview", "position", "previewWidth", "previewHeight", "fullWidth", "enabled"], ["slotIndex", "locked"]);
  const assetId = siteAsset(w.assetId);
  for (const k of ["previewWidth", "previewHeight", "fullWidth"] as const) if (!Number.isSafeInteger(w[k]) || (w[k] as number) < 1 || (w[k] as number) > 100000) throw new Error("作品尺寸不合法");
  if (typeof w.enabled !== "boolean" || (w.locked !== undefined && typeof w.locked !== "boolean") || (w.slotIndex !== undefined && (!Number.isSafeInteger(w.slotIndex) || (w.slotIndex as number) < 0 || (w.slotIndex as number) > 1000))) throw new Error("作品配置不合法");
  for (const k of ["image", "preview"] as const) {
    if (typeof w[k] !== "string" || (w[k] !== "" && !new RegExp(`^/api/sites/[a-z0-9-]+/assets/${assetId}/(?:thumbnail|card|full)$`).test(w[k] as string))) throw new Error("作品地址不合法");
  }
  return { assetId, ...(w.slotIndex !== undefined ? { slotIndex: w.slotIndex as number } : {}), ...(w.locked !== undefined ? { locked: w.locked as boolean } : {}),
    code: basicText(w.code), title: basicText(w.title), subtitle: basicText(w.subtitle), position: basicText(w.position, 100),
    image: "", preview: "", previewWidth: w.previewWidth as number, previewHeight: w.previewHeight as number, fullWidth: w.fullWidth as number, enabled: w.enabled };
}
export function contentAssetIds(space: ContentSpace, content: SpaceContent): string[] {
  if (space === "premium-flow-gallery") {
    const d = content as FlowGalleryDocumentV1;
    return [...new Set([...(d.background.assetId ? [d.background.assetId] : []), ...d.groups.flatMap(g => g.assetIds), ...d.contact.items.flatMap(i => i.qrAssetId ? [i.qrAssetId] : [])])];
  }
  const ids = (content as SiteContent | PreviewPortfolioDocumentV1).social.flatMap(s => s.qrAssetId ? [s.qrAssetId] : []);
  if (space === "premium-polaroid") for (const c of (content as PreviewPortfolioDocumentV1).collections) ids.push(...c.assetIds, ...[c.coverAssetId,c.focusAssetId].filter((v): v is string => Boolean(v)));
  else { const c = content as SiteContent; for (const w of [...c.works, ...Object.values(c.templateWorks ?? {}).flat()]) if (w.assetId) ids.push(w.assetId); }
  return [...new Set(ids)];
}
export function parseSpaceContent(space: ContentSpace, value: unknown): SpaceContent {
  if (space === "premium-flow-gallery") return parseFlowGalleryDocument(value);
  if (space === "premium-polaroid") {
    return parseSitePremiumDocument(value);
  }
  const raw = basicRecord(value, ["activeTemplate", "profile", "hero", "trustItems", "works", "templateWorks", "packages", "contact", "social", "bookingFields", "statement"]);
  const { activeTemplate, works, templateWorks } = raw;
  if (typeof activeTemplate !== "string" || !isTemplateId(activeTemplate)) throw new Error("未知基础模板");
  if (!Array.isArray(works) || !templateWorks || typeof templateWorks !== "object" || Array.isArray(templateWorks)) throw new Error("基础作品格式错误");
  for (const [id, entries] of Object.entries(templateWorks)) {
    if (!isTemplateId(id) || !Array.isArray(entries)) throw new Error("模板作品格式错误");
    basicList(entries, 500);
  }
  const content: SiteContent = {
    activeTemplate, works: basicList(works, 500).map(parseWork), templateWorks: Object.fromEntries(Object.entries(templateWorks).map(([id, entries]) => [id, (entries as unknown[]).map(parseWork)])),
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
        siteAsset(s.qrAssetId);
      }
      return { label: basicText(s.label, 100), handle: basicText(s.handle), ...(s.qrAssetId ? { qrAssetId: s.qrAssetId as string } : {}) };
    }),
    bookingFields: basicList(raw.bookingFields, 40).map(v => basicText(v, 200)),
  };
  if (new TextEncoder().encode(JSON.stringify(content)).byteLength > 512_000) throw new Error("基础内容超过 512 KB");
  return content;
}
