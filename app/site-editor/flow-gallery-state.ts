import type { FlowGalleryDocumentV1 } from "./flow-gallery-document";

export type FlowGroup = FlowGalleryDocumentV1["groups"][number];
export type FlowRemoval =
  | { kind: "photo"; groupId: string; id: string; caption?: string; index: number }
  | { kind: "price"; item: FlowGalleryDocumentV1["pricing"]["packages"][number]; index: number }
  | { kind: "contact"; item: FlowGalleryDocumentV1["contact"]["items"][number]; index: number };

/** Restore only the removed item so intervening edits remain intact. */
export function restoreFlowRemoval(document: FlowGalleryDocumentV1, removal: FlowRemoval): FlowGalleryDocumentV1 {
  const insert = <T,>(items: T[], item: T) => { const next = [...items]; next.splice(Math.max(0, Math.min(removal.index, next.length)), 0, item); return next; };
  if (removal.kind === "photo") {
    const group = document.groups.find(value => value.id === removal.groupId);
    if (!group) throw new Error("原作品分类已移除，无法恢复照片引用。图库照片仍保留。");
    if (group.assetIds.includes(removal.id)) return document;
    if (group.assetIds.length >= 500) throw new Error("分类已达 500 张，先移出一张再撤销。");
    return { ...document, groups: document.groups.map(value => value.id !== group.id ? value : { ...value, assetIds: insert(value.assetIds, removal.id), captions: removal.caption === undefined ? value.captions : { ...value.captions, [removal.id]: removal.caption } }) };
  }
  if (removal.kind === "price") {
    if (document.pricing.packages.some(value => value.id === removal.item.id)) return document;
    if (document.pricing.packages.length >= 30) throw new Error("价格项目已达上限，先移除一个再撤销。");
    return { ...document, pricing: { ...document.pricing, packages: insert(document.pricing.packages, removal.item) } };
  }
  if (document.contact.items.some(value => value.id === removal.item.id)) return document;
  if (document.contact.items.length >= 20) throw new Error("联系方式已达上限，先移除一个再撤销。");
  return { ...document, contact: { ...document.contact, items: insert(document.contact.items, removal.item) } };
}
/** Compare edits with a save receipt without depending on object construction order.
 * Arrays retain their order because category/photo/price order is business content.
 * Accept incomplete editing values; schema validation belongs at the save boundary.
 */
export function flowGalleryFingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(flowGalleryFingerprint).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${flowGalleryFingerprint((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
export function addFlowMembers(group: FlowGroup, ids: readonly string[], available: ReadonlySet<string>): FlowGroup {
  if (ids.some(id => !available.has(id))) throw new Error("部分照片不在当前本站素材中，请重新读取图库。");
  const assetIds = [...new Set([...group.assetIds, ...ids])];
  if (assetIds.length > 500) throw new Error("每个作品分类最多 500 张，请减少选择。");
  return { ...group, assetIds };
}
export function removeFlowMember(group: FlowGroup, id: string): FlowGroup {
  const captions = { ...group.captions }; delete captions[id];
  return { ...group, assetIds: group.assetIds.filter(value => value !== id), captions };
}
export function removeFlowGroup(document: FlowGalleryDocumentV1, id: string): FlowGalleryDocumentV1 {
  return { ...document, groups: document.groups.filter(group => group.id !== id), rails: { ...document.rails, leftGroupId: document.rails.leftGroupId === id ? null : document.rails.leftGroupId, rightGroupId: document.rails.rightGroupId === id ? null : document.rails.rightGroupId } };
}
