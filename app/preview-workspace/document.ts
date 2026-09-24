import type { SiteContent } from "../site-config";
import type { Collection } from "../templates/polaroid-field/collection-model";

export type PreviewPortfolioDocumentV1 = Pick<SiteContent, "profile" | "hero" | "trustItems" | "packages" | "contact" | "social" | "bookingFields" | "statement"> & { schemaVersion: 1; collections: Collection[] };
export const PREVIEW_LIMITS = { bytes: 512_000, collections: 30, members: 500, text: 2_000 } as const;
const ASSET = /^[A-Za-z0-9_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function invalid(path: string): never { throw new Error(`新版内容字段不合法：${path}`); }
function record(value: unknown, keys: string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(path);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key))) invalid(path);
  return result;
}
function text(value: unknown, path: string, max: number = PREVIEW_LIMITS.text): string {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || /(?:data:[^;]*;base64,|file:\/\/|(?:^|\s)[A-Za-z]:[\\/])/.test(value)) return invalid(path);
  return value;
}
function fields(value: unknown, keys: string[], path: string): Record<string, string> {
  const object = record(value, keys, path);
  return Object.fromEntries(keys.map((key) => [key, text(object[key], `${path}.${key}`)]));
}
function list(value: unknown, max: number, path: string): unknown[] { if (!Array.isArray(value) || value.length > max) return invalid(path); return value; }
function boolean(value: unknown, path: string): boolean { if (typeof value !== "boolean") return invalid(path); return value; }
function asset(value: unknown, path: string): string { if (typeof value !== "string" || !ASSET.test(value)) return invalid(path); return value; }
function optionalAsset(value: unknown, path: string): string | null { return value === null ? null : asset(value, path); }

/** Strict and lossless: unknown fields and malformed relationships are rejected. */
export function parsePreviewDocument(value: unknown): PreviewPortfolioDocumentV1 {
  const d = record(value, ["schemaVersion", "profile", "hero", "trustItems", "packages", "contact", "social", "bookingFields", "statement", "collections"], "document");
  if (d.schemaVersion !== 1) invalid("schemaVersion（只支持版本 1）");
  const profile = fields(d.profile, ["brand", "mark", "photographer", "role", "city", "availability", "intro"], "profile") as PreviewPortfolioDocumentV1["profile"];
  const hero = fields(d.hero, ["eyebrow", "title", "services"], "hero") as PreviewPortfolioDocumentV1["hero"];
  const contact = fields(d.contact, ["wechat", "email", "note"], "contact") as PreviewPortfolioDocumentV1["contact"];
  const statement = fields(d.statement, ["eyebrow", "lineOne", "lineTwo"], "statement") as PreviewPortfolioDocumentV1["statement"];
  const trustItems = list(d.trustItems, 20, "trustItems").map((x) => fields(x, ["label", "value"], "trustItems") as { label: string; value: string });
  const packages = list(d.packages, 30, "packages").map((x) => {
    const p = record(x, ["number", "english", "name", "description", "price", "duration", "deliverables", "enabled"], "packages");
    return { ...Object.fromEntries(["number", "english", "name", "description", "price", "duration"].map((key) => [key, text(p[key], `packages.${key}`)])), deliverables: list(p.deliverables, 30, "deliverables").map((v) => text(v, "deliverables")), enabled: boolean(p.enabled, "packages.enabled") } as PreviewPortfolioDocumentV1["packages"][number];
  });
  const social = list(d.social, 20, "social").map((x) => {
    const s = record(x, ["label", "handle", "qrAssetId"], "social");
    if (s.qrAssetId !== undefined && (typeof s.qrAssetId !== "string" || !/^[a-f0-9]{64}$/.test(s.qrAssetId))) invalid("social.qrAssetId");
    return { label: text(s.label, "social.label", 100), handle: text(s.handle, "social.handle"), ...(s.qrAssetId ? { qrAssetId: s.qrAssetId as string } : {}) };
  });
  const collections = list(d.collections, PREVIEW_LIMITS.collections, "collections").map((x): Collection => {
    const c = record(x, ["id", "name", "description", "visible", "coverAssetId", "coverFit", "coverFocusX", "coverFocusY", "assetIds", "focusAssetId"], "collections");
    if (typeof c.id !== "string" || !UUID.test(c.id)) invalid("collections.id");
    const name = text(c.name, "collections.name", 120); if (!name.trim()) invalid("collections.name");
    if (c.coverFit !== "natural" && c.coverFit !== "fill") invalid("collections.coverFit");
    for (const key of ["coverFocusX", "coverFocusY"]) if (typeof c[key] !== "number" || !Number.isFinite(c[key]) || c[key] < 0 || c[key] > 100) invalid(key);
    const assetIds = list(c.assetIds, PREVIEW_LIMITS.members, "collections.assetIds").map((v) => asset(v, "assetIds"));
    if (new Set(assetIds).size !== assetIds.length) invalid("重复成员");
    const focusAssetId = optionalAsset(c.focusAssetId, "focusAssetId");
    if (focusAssetId && !assetIds.includes(focusAssetId)) invalid("重点照片必须属于图集成员");
    return { id: c.id as string, name, description: text(c.description, "description"), visible: boolean(c.visible, "visible"), coverAssetId: optionalAsset(c.coverAssetId, "coverAssetId"), coverFit: c.coverFit as Collection["coverFit"], coverFocusX: c.coverFocusX as number, coverFocusY: c.coverFocusY as number, assetIds, focusAssetId };
  });
  if (new Set(collections.map((c) => c.id)).size !== collections.length) invalid("重复图集 ID");
  const result = { schemaVersion: 1 as const, profile, hero, contact, statement, trustItems, packages, social, bookingFields: list(d.bookingFields, 40, "bookingFields").map((v) => text(v, "bookingFields", 200)), collections };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > PREVIEW_LIMITS.bytes) invalid("内容超过 512 KB");
  return result;
}
export function createEmptyPreviewDocument(): PreviewPortfolioDocumentV1 {
  return { schemaVersion: 1, profile: { brand: "", mark: "", photographer: "", role: "", city: "", availability: "", intro: "" }, hero: { eyebrow: "", title: "", services: "" }, contact: { wechat: "", email: "", note: "" }, statement: { eyebrow: "", lineOne: "", lineTwo: "" }, trustItems: [], packages: [], social: [], bookingFields: [], collections: [] };
}
export function copyLegacyBasics(content: SiteContent): PreviewPortfolioDocumentV1 {
  const { profile, hero, contact, statement, trustItems, packages, social, bookingFields } = content;
  return parsePreviewDocument(JSON.parse(JSON.stringify({ schemaVersion: 1, profile, hero, contact, statement, trustItems, packages, social, bookingFields, collections: [] })));
}
