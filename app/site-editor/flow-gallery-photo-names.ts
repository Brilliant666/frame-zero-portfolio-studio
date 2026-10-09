import type { SiteAsset } from "./assets-client";

const orientationNames = { portrait: "竖幅", landscape: "横幅", square: "方幅" };

/** A caption belongs to this category; the fallback describes its displayed order. */
export function flowPhotoName(groupName: string, index: number, caption = "") {
  return caption.trim() ? caption : `${groupName} · 第 ${index + 1} 张照片`;
}

/** The index is within the current filtered result, including earlier pages. */
export function flowAssetName(asset: Pick<SiteAsset, "orientation">, index: number) {
  return `第 ${index + 1} 张照片，${orientationNames[asset.orientation]}`;
}
