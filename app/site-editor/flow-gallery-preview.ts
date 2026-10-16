import type { PhotoAsset } from "../photo-library";
import type { FlowGalleryDocumentV1 } from "./flow-gallery-document";

export type FlowGroupPreviewTarget =
  | { status: "ready"; groupId: string; name: string }
  | { status: "missing" | "hidden" | "empty"; message: string };

/** Check the requested stable identity without changing visibility, members or order. */
export function resolveFlowGroupPreview(document: FlowGalleryDocumentV1, assets: readonly PhotoAsset[], groupId: string | null): FlowGroupPreviewTarget {
  const group = document.groups.find(item => item.id === groupId);
  if (!group) return { status: "missing", message: "当前分类已不存在，请重新选择分类后查看效果。" };
  if (!group.visible) return { status: "hidden", message: "当前分类已隐藏，完整作品中不会展示。请先在分类设置中决定是否展示。" };
  const available = new Set(assets.map(asset => asset.id));
  if (!group.assetIds.some(id => available.has(id))) return { status: "empty", message: "当前分类没有可展示的照片，请先从本站图库选片或核对素材后查看效果。" };
  return { status: "ready", groupId: group.id, name: group.name };
}
