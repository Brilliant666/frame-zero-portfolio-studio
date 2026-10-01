/** Independent Site document. Only stable Site asset identities are persisted. */
export type FlowGalleryDocumentV1 = {
  schemaVersion: 1;
  profile: { brand: string; title: string; intro: string };
  background: { assetId: string | null; focalPoint: { x: number; y: number } };
  groups: { id: string; name: string; assetIds: string[]; captions: Record<string, string>; visible: boolean }[];
  rails: { leftGroupId: string | null; rightGroupId: string | null; leftWidthPercent?: number };
  pricing: { enabled: boolean; heading: string; introduction: string; packages: { id: string; name: string; price: string; description: string; details: string[]; enabled: boolean }[] };
  contact: { enabled: boolean; heading: string; intro: string; items: { id: string; label: string; value: string; href: string; qrAssetId?: string }[] };
};

export const FLOW_GALLERY_LIMITS = { bytes: 512_000, groups: 30, members: 500, packages: 30, details: 30, contacts: 20, text: 2_000 } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SITE_ASSET = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function invalid(path: string): never { throw new Error(`流影视廊内容字段不合法：${path}`); }
function record(value: unknown, keys: string[], path: string, optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(path);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(key => !keys.includes(key)) || keys.some(key => !optional.includes(key) && !Object.hasOwn(result, key))) invalid(path);
  return result;
}
function text(value: unknown, path: string, max: number = FLOW_GALLERY_LIMITS.text): string {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || /(?:data:[^;]*;base64,|file:\/\/|(?:^|\s)[A-Za-z]:[\\/])/.test(value)) return invalid(path);
  return value;
}
function list(value: unknown, max: number, path: string): unknown[] { if (!Array.isArray(value) || value.length > max) return invalid(path); return value; }
function bool(value: unknown, path: string): boolean { if (typeof value !== "boolean") return invalid(path); return value; }
function identity(value: unknown, path: string, asset = false): string {
  if (typeof value !== "string" || !(asset ? SITE_ASSET : UUID).test(value)) return invalid(path);
  return value.toLowerCase();
}
function nullableIdentity(value: unknown, path: string, asset = false): string | null { return value === null ? null : identity(value, path, asset); }
function unique(values: string[], path: string) { if (new Set(values).size !== values.length) invalid(path); }
function safeHref(value: unknown, path: string): string {
  const result = text(value, path);
  if (!result) return result;
  if (result.trim() !== result || /[\s\u007f]/.test(result)) invalid(path);
  let url: URL;
  try { url = new URL(result); } catch { return invalid(path); }
  if (!["https:", "http:", "mailto:"].includes(url.protocol) || url.username || url.password || (url.protocol === "mailto:" && !url.pathname)) invalid(path);
  return result;
}

export function createEmptyFlowGalleryDocument(): FlowGalleryDocumentV1 {
  return { schemaVersion: 1, profile: { brand: "", title: "", intro: "" }, background: { assetId: null, focalPoint: { x: 50, y: 50 } }, groups: [], rails: { leftGroupId: null, rightGroupId: null }, pricing: { enabled: false, heading: "", introduction: "", packages: [] }, contact: { enabled: false, heading: "", intro: "", items: [] } };
}

/** Reject unknown fields, oversized bodies and broken group/member relationships. */
export function parseFlowGalleryDocument(value: unknown): FlowGalleryDocumentV1 {
  const d = record(value, ["schemaVersion", "profile", "background", "groups", "rails", "pricing", "contact"], "document");
  if (d.schemaVersion !== 1) invalid("schemaVersion（只支持版本 1）");
  const p = record(d.profile, ["brand", "title", "intro"], "profile");
  const b = record(d.background, ["assetId", "focalPoint"], "background");
  const focal = record(b.focalPoint, ["x", "y"], "background.focalPoint");
  for (const key of ["x", "y"]) if (typeof focal[key] !== "number" || !Number.isFinite(focal[key]) || (focal[key] as number) < 0 || (focal[key] as number) > 100) invalid(`background.focalPoint.${key}`);
  const groups = list(d.groups, FLOW_GALLERY_LIMITS.groups, "groups").map((value, index) => {
    const path = `groups.${index}`, g = record(value, ["id", "name", "assetIds", "captions", "visible"], path);
    const name = text(g.name, `${path}.name`, 120); if (!name.trim()) invalid(`${path}.name`);
    const assetIds = list(g.assetIds, FLOW_GALLERY_LIMITS.members, `${path}.assetIds`).map(v => identity(v, `${path}.assetIds`, true));
    unique(assetIds, `${path}.assetIds（重复成员）`);
    if (!g.captions || typeof g.captions !== "object" || Array.isArray(g.captions)) invalid(`${path}.captions`);
    const captions = Object.fromEntries(Object.entries(g.captions as Record<string, unknown>).map(([key, value]) => {
      const id = identity(key, `${path}.captions`, true);
      if (!assetIds.includes(id)) invalid(`${path}.captions（说明必须属于本组成员）`);
      return [id, text(value, `${path}.captions.${id}`)];
    }));
    if (Object.keys(captions).length !== Object.keys(g.captions as object).length) invalid(`${path}.captions（重复成员）`);
    return { id: identity(g.id, `${path}.id`), name, assetIds, captions, visible: bool(g.visible, `${path}.visible`) };
  });
  unique(groups.map(g => g.id), "groups（重复分组 ID）");
  const r = record(d.rails, ["leftGroupId", "rightGroupId", "leftWidthPercent"], "rails", ["leftWidthPercent"]);
  if (Object.hasOwn(r, "leftWidthPercent") && (typeof r.leftWidthPercent !== "number" || !Number.isInteger(r.leftWidthPercent) || r.leftWidthPercent < 30 || r.leftWidthPercent > 70)) invalid("rails.leftWidthPercent（须为 30–70 的整数）");
  const rails = { leftGroupId: nullableIdentity(r.leftGroupId, "rails.leftGroupId"), rightGroupId: nullableIdentity(r.rightGroupId, "rails.rightGroupId"), ...(Object.hasOwn(r, "leftWidthPercent") ? { leftWidthPercent: r.leftWidthPercent as number } : {}) };
  for (const id of [rails.leftGroupId, rails.rightGroupId]) if (id && !groups.some(g => g.id === id)) invalid("rails（轨道分组必须存在）");
  const pricing = record(d.pricing, ["enabled", "heading", "introduction", "packages"], "pricing");
  const packages = list(pricing.packages, FLOW_GALLERY_LIMITS.packages, "pricing.packages").map((value, index) => {
    const path = `pricing.packages.${index}`, p = record(value, ["id", "name", "price", "description", "details", "enabled"], path);
    return { id: identity(p.id, `${path}.id`), name: text(p.name, `${path}.name`, 120), price: text(p.price, `${path}.price`, 200), description: text(p.description, `${path}.description`), details: list(p.details, FLOW_GALLERY_LIMITS.details, `${path}.details`).map(v => text(v, `${path}.details`)), enabled: bool(p.enabled, `${path}.enabled`) };
  });
  unique(packages.map(p => p.id), "pricing.packages（重复套餐 ID）");
  const contact = record(d.contact, ["enabled", "heading", "intro", "items"], "contact");
  const items = list(contact.items, FLOW_GALLERY_LIMITS.contacts, "contact.items").map((value, index) => {
    const path = `contact.items.${index}`, i = record(value, ["id", "label", "value", "href", "qrAssetId"], path, ["qrAssetId"]);
    return { id: identity(i.id, `${path}.id`), label: text(i.label, `${path}.label`, 100), value: text(i.value, `${path}.value`), href: safeHref(i.href, `${path}.href`), ...(i.qrAssetId !== undefined ? { qrAssetId: identity(i.qrAssetId, `${path}.qrAssetId`, true) } : {}) };
  });
  unique(items.map(i => i.id), "contact.items（重复联系项 ID）");
  const result: FlowGalleryDocumentV1 = {
    schemaVersion: 1, profile: { brand: text(p.brand, "profile.brand", 120), title: text(p.title, "profile.title", 500), intro: text(p.intro, "profile.intro") },
    background: { assetId: nullableIdentity(b.assetId, "background.assetId", true), focalPoint: { x: focal.x as number, y: focal.y as number } }, groups, rails,
    pricing: { enabled: bool(pricing.enabled, "pricing.enabled"), heading: text(pricing.heading, "pricing.heading", 500), introduction: text(pricing.introduction, "pricing.introduction"), packages },
    contact: { enabled: bool(contact.enabled, "contact.enabled"), heading: text(contact.heading, "contact.heading", 500), intro: text(contact.intro, "contact.intro"), items },
  };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > FLOW_GALLERY_LIMITS.bytes) invalid("内容超过 512 KB");
  return result;
}
