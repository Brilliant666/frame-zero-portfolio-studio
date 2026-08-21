export const PLATFORM_QR_ASSET_ID_PATTERN = /^[a-f0-9]{64}$/;

export function normalizePlatformQrAssetId(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return PLATFORM_QR_ASSET_ID_PATTERN.test(normalized) ? normalized : undefined;
}

export function getPlatformQrAssetPath(value: unknown) {
  const assetId = normalizePlatformQrAssetId(value);
  return assetId ? `/api/platform-qr/${assetId}` : null;
}
