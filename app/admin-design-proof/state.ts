import type { SiteAsset } from "../site-editor/assets-client";
import { createEmptyFlowGalleryDocument, type FlowGalleryDocumentV1 } from "../site-editor/flow-gallery-document";

export type ProofAsset = SiteAsset & { name: string };
export function proofAssets(count = 18): ProofAsset[] {
  return Array.from({ length: count }, (_, i) => {
    const key = ["background", "portrait", "closeup"][i % 3];
    const width = key === "background" ? 1536 : 1024;
    const height = key === "portrait" ? 1536 : 1024;
    const variant = (size: string, w: number) => ({ src: `/preview/admin-design/asset/${key}?size=${size}`, width: w, height: Math.round(w * height / width), bytes: 1 });
    return { id: `proof-photo-${i + 1}`, name: `${["温室午后", "柔光肖像", "窗边片刻"][i % 3]} ${String(i + 1).padStart(2, "0")}`, createdAt: "2026-10-01T00:00:00.000Z", aspectRatio: width / height,
      orientation: width > height ? "landscape" : width < height ? "portrait" : "square",
      variants: { thumbnail: variant("thumbnail", 320), card: variant("card", 720), full: variant("full", width) } };
  });
}
export type ProofGroup = FlowGalleryDocumentV1["groups"][number];
export type ProofHome = Pick<FlowGalleryDocumentV1, "profile" | "background" | "rails">;
export function newProofGroup(id: string, name: string): ProofGroup {
  return { id, name: name.trim(), captions: {}, assetIds: [], visible: true };
}
export function proofGroups(assets: readonly SiteAsset[]): ProofGroup[] {
  return [
    { ...newProofGroup("afternoon", "午后的光"), assetIds: assets.slice(0, 6).map(a => a.id) },
    { ...newProofGroup("portraits", "人物与片刻"), assetIds: assets.slice(6, 12).map(a => a.id) },
    { ...newProofGroup("practice", "练习存档"), visible: false, assetIds: assets.slice(12, 15).map(a => a.id) },
  ];
}
export function proofHome(): ProofHome {
  return { profile: { brand: "流影", title: "作品画廊", intro: "光影与人物的片刻，可以单独点开欣赏。" }, background: { assetId: "proof-photo-1", focalPoint: { x: 50, y: 50 } }, rails: { leftGroupId: "afternoon", rightGroupId: "portraits" } };
}
export function proofDocument(groups: readonly ProofGroup[], home: ProofHome): FlowGalleryDocumentV1 {
  return { ...createEmptyFlowGalleryDocument(), ...home, groups: [...groups] };
}
/** Selection order is explicit; adding existing members never changes their order. */
export function addProofMembers(collection: ProofGroup, ids: readonly string[], assets: readonly SiteAsset[]) {
  const available = new Set(assets.map(a => a.id));
  const assetIds = [...new Set([...collection.assetIds, ...ids.filter(id => available.has(id))])];
  return { ...collection, assetIds };
}
export function removeProofMember(collection: ProofGroup, id: string) {
  const assetIds = collection.assetIds.filter(value => value !== id);
  const captions = Object.fromEntries(Object.entries(collection.captions).filter(([key]) => key !== id));
  return { ...collection, assetIds, captions };
}
export function filterProofAssets(assets: readonly ProofAsset[], query: string, orientation: string) {
  return assets.filter(a => (orientation === "all" || a.orientation === orientation) && a.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
}
export function proofSnapshot(groups: readonly ProofGroup[], home: ProofHome = proofHome()) {
  return JSON.stringify(proofDocument(groups, home));
}
export function validateProofUpload(file: { size: number; type: string }) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "请选择 JPG、PNG 或 WebP 图片";
  if (file.size > 20 * 1024 * 1024) return "单张图片不能超过 20 MB";
  if (!file.size) return "图片文件为空";
  return null;
}
