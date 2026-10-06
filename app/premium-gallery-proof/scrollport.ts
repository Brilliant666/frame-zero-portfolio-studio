/** Private previews scroll their artwork viewport. Public pages scroll the window. */
export function galleryScrollport(root: HTMLElement | null): HTMLElement | null {
  return root?.closest<HTMLElement>("[data-preview-scrollport], [data-flow-scrollport]") ?? null;
}
type Viewport = Pick<Window, "scrollY" | "scrollTo">;
export function galleryScrollTop(port: HTMLElement | null, viewport: Viewport): number {
  return port ? port.scrollTop : viewport.scrollY;
}
export function restoreGalleryScroll(port: HTMLElement | null, viewport: Viewport, top: number): void {
  (port ?? viewport).scrollTo({ top, left: 0, behavior: "instant" });
}
