export type ContactCardEntry = { label: string; handle: string; qrAssetId?: string };

/** Match the actual entry, never a recycled list index or identical label. */
export function setContactCardReference<T extends ContactCardEntry>(entries: T[], expected: T, assetId: string | undefined): T[] {
  const index = entries.indexOf(expected);
  if (index < 0 || entries.lastIndexOf(expected) !== index) return entries;
  if (assetId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) return entries;
  return entries.map((entry, i) => {
    if (i !== index) return entry;
    const next = { ...entry };
    if (assetId === undefined) delete next.qrAssetId;
    else next.qrAssetId = assetId;
    return next;
  });
}
