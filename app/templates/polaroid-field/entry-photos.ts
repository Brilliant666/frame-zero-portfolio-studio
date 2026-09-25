import type { PhotoAsset } from "../../photo-library";

const prepared = new Map<string, Promise<boolean>>();
export function entryPhotoSource(asset: PhotoAsset, width = 600) {
  const tier = width > 1100 ? 2200 : width > 600 ? 1100 : 600;
  return `/__local-preview-photo?src=${encodeURIComponent(asset.variants[tier > 1100 ? "full" : "card"].src)}&w=${tier}`;
}
export function prepareEntryPhoto(src: string): Promise<boolean> {
  src = new URL(src, location.href).href;
  const cached = prepared.get(src);
  if (cached) return cached;
  const image = new Image();
  image.decoding = "async";
  const ready = new Promise<boolean>(resolve => {
    image.onload = () => { void image.decode().then(() => { performance.mark(`entry:decoded:${src}`); resolve(true); }).catch(()=>{prepared.delete(src);resolve(false);}); };
    image.onerror = () => { prepared.delete(src); resolve(false); };
  });
  prepared.set(src, ready); image.src = src;
  return ready;
}
export function prepareEntryPhotos(assets: readonly PhotoAsset[]) {
  return Promise.all(assets.map(asset => prepareEntryPhoto(entryPhotoSource(asset))));
}

/** Decode before exposure. A late image reveals softly instead of popping into paper. */
export function revealEntryImage(image: HTMLImageElement, landing = false) {
  const src = image.currentSrc || image.src;
  void image.decode().catch(() => {}).then(() => {
    if (!image.isConnected || (image.currentSrc || image.src) !== src) return;
    performance.mark(`entry:visible:${src}`);
    const hidden = image.style.opacity === "0";
    image.style.opacity = "1";
    if (hidden && !landing && !matchMedia("(prefers-reduced-motion: reduce)").matches) image.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
  });
}
