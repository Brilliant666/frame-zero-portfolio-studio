import type { PreviewPortfolioDocumentV1 } from "./document";

export function previewIsDirty(draft: unknown, saved: unknown) {
  return JSON.stringify(draft) !== JSON.stringify(saved);
}

/** A successful response acknowledges only the submitted snapshot. */
export function reconcilePreviewSave<T>(submitted: T, current: T, persisted: T) {
  const changedWhileSaving = previewIsDirty(submitted, current);
  return { draft: changedWhileSaving ? current : persisted, saved: persisted, changedWhileSaving };
}

export function importPrototypeCollections(value: unknown, draft: PreviewPortfolioDocumentV1, createId: () => string) {
  const raw = Array.isArray(value) ? value : value && typeof value === "object" && "collections" in value ? value.collections : null;
  if (!Array.isArray(raw)) throw new Error("请选择包含图集数组或 { collections } 的 JSON 文件。");
  // Validate the complete result with the dedicated document parser at the call site.
  return { ...draft, collections: raw.map((entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("导入图集格式不正确。");
    return { ...entry, id: createId() };
  }) };
}
