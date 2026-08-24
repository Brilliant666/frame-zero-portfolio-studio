const LOCAL_EDITING_ORIGIN_PATTERN = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/;

export function getLocalEditingServiceOrigin() {
  const value = process.env.FRAME_ZERO_LOCAL_PHOTO_IMPORT_ORIGIN;
  const match = LOCAL_EDITING_ORIGIN_PATTERN.exec(value ?? "");
  if (!match || Number(match[1]) > 65_535) return null;
  return value ?? null;
}
