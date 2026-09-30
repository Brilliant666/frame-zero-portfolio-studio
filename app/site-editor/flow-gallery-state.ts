import type { FlowGalleryDocumentV1 } from "./flow-gallery-document";

export type FlowGroup = FlowGalleryDocumentV1["groups"][number];
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
