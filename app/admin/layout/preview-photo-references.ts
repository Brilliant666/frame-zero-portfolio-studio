// Keep this read-only check separate from the old SiteContent save contract.
export type PreviewPhotoReferences = ReadonlyMap<string, number>;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function parsePreviewPhotoReferences(value: unknown): PreviewPhotoReferences | null {
  const envelope = object(value);
  if (!envelope) return null;
  if (envelope.configured === false && envelope.content === null) return new Map();
  if (envelope.content === null && envelope.revision === 0 && envelope.updatedAt === null) return new Map();
  const content = object(envelope.content);
  if (!content || content.schemaVersion !== 1 || !Array.isArray(content.collections)) return null;
  const references = new Map<string, number>();
  const add = (id: unknown, optional = false) => {
    if (optional && id === null) return true;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return false;
    references.set(id, (references.get(id) ?? 0) + 1);
    return true;
  };
  for (const value of content.collections) {
    const collection = object(value);
    if (!collection || !Array.isArray(collection.assetIds)
      || !add(collection.coverAssetId, true) || !add(collection.focusAssetId, true)
      || !collection.assetIds.every((id) => add(id))) return null;
  }
  return references;
}

export async function loadPreviewPhotoReferences(
  fetchImpl: typeof fetch = fetch,
): Promise<PreviewPhotoReferences> {
  const response = await fetchImpl("/api/preview/site-content", { cache: "no-store" });
  if (!response.ok) throw new Error("新版图集引用未核验，暂不能回收素材；请恢复新版内容读取后重试。");
  const references = parsePreviewPhotoReferences(await response.json());
  if (!references) throw new Error("新版图集引用数据无效，暂不能回收素材。");
  return references;
}
