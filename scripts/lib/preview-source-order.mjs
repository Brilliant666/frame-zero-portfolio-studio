/** One-off ordering plan from verified source-hash/mtime records, never variant dates. */
export function planSourceMtimeOrder(content, records) {
  const times = new Map(), ambiguous = new Set();
  for (const record of records) {
    if (!/^[a-f0-9]{64}$/.test(record.assetId) || record.assetId !== record.sourceHash || !Number.isFinite(record.mtimeMs) || record.mtimeMs < 0) continue;
    if (times.has(record.assetId) && times.get(record.assetId) !== record.mtimeMs) ambiguous.add(record.assetId);
    times.set(record.assetId, record.mtimeMs);
  }
  const next = structuredClone(content), results = [];
  for (const collection of next.collections) {
    const reliable = collection.assetIds.every(id => times.has(id) && !ambiguous.has(id));
    const before = [...collection.assetIds];
    if (reliable) collection.assetIds = before.map((id, index) => ({ id, index })).sort((a, b) => times.get(b.id) - times.get(a.id) || a.index - b.index).map(item => item.id);
    results.push({ id: collection.id, status: reliable ? "SOURCE_MTIME_VERIFIED" : "SOURCE_MTIME_UNAVAILABLE", changed: collection.assetIds.some((id, index) => id !== before[index]) });
  }
  return { content: next, results };
}
