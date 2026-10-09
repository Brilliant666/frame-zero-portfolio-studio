import { galleryScrollport, galleryScrollTop, restoreGalleryScroll } from "./scrollport";

/** Position a preview heading below the real navigation in its own artwork viewport. */
export function scrollToGalleryGroup(root: HTMLElement, heading: HTMLElement, viewport: Window): number {
  const port = galleryScrollport(root);
  const portTop = port?.getBoundingClientRect().top ?? 0;
  const navigation = root.querySelector<HTMLElement>("header");
  const inset = Math.max(0, (navigation?.getBoundingClientRect().bottom ?? portTop) - portTop) + 16;
  const top = Math.max(0, galleryScrollTop(port, viewport) + heading.getBoundingClientRect().top - portTop - inset);
  restoreGalleryScroll(port, viewport, top);
  return galleryScrollTop(port, viewport);
}
