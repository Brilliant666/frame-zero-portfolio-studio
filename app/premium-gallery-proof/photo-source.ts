import type { GalleryPhoto } from "./model";

/** Width descriptors use encoded pixel widths, including narrow portrait variants. */
export function galleryPhotoSource(photo: GalleryPhoto, sizes: string, full = false) {
  if (full) return { src: photo.fullUrl ?? photo.url };
  const widths = new Map<number, string>();
  for (const variant of photo.variants ?? []) {
    if (Number.isFinite(variant.width) && variant.width > 0 && !widths.has(variant.width)) widths.set(variant.width, variant.url);
  }
  if (!widths.size) return { src: photo.url };
  return {
    src: photo.url,
    srcSet: [...widths].sort(([a], [b]) => a - b).map(([width, url]) => `${url} ${width}w`).join(", "),
    sizes,
  };
}
