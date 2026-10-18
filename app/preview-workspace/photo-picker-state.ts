import { parseSitePremiumDocument } from "../site-editor/content-schema";
import { PREVIEW_LIMITS, type PreviewPortfolioDocumentV1 } from "./document";

export function appendPickedPhotos(document: PreviewPortfolioDocumentV1, collectionId: string, picked: readonly string[], availableIds: ReadonlySet<string>, expectedRevision = 0) {
  const collection = document.collections.find(item => item.id === collectionId);
  if (!collection) throw new Error("目标图集已改变，请关闭选片面板后重新选择。");
  const members = new Set(collection.assetIds);
  const additions = [...new Set(picked)].filter(id => !members.has(id));
  if (additions.some(id => !availableIds.has(id))) throw new Error("已选照片中有不可用素材，请重新读取并核对选择。");
  if (collection.assetIds.length + additions.length > PREVIEW_LIMITS.members) throw new Error(`此图集还可加入 ${PREVIEW_LIMITS.members - collection.assetIds.length} 张，当前新增 ${additions.length} 张；请减少选择。`);
  const next = { ...document, collections: document.collections.map(item => item.id === collectionId ? { ...item, assetIds: [...item.assetIds, ...additions] } : item) };
  // Validate the complete document, including the byte limit, before changing the draft.
  const parsed = parseSitePremiumDocument(next);
  if (new TextEncoder().encode(JSON.stringify({ content: parsed, expectedRevision })).byteLength > PREVIEW_LIMITS.bytes) throw new Error("加入后超出草稿保存大小上限，请减少照片或文字；草稿未改变。");
  return { document: parsed, additions };
}
