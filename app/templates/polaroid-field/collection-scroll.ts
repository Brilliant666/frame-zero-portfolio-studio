/** Embedded previews scroll their dialog; full-page views scroll the window. */
export function collectionScrollTarget(root: HTMLElement | null): HTMLElement | Window {
  const view = root?.ownerDocument.defaultView ?? window;
  for (let parent = root?.parentElement; parent && parent !== root?.ownerDocument.body; parent = parent.parentElement) {
    if (/(auto|scroll|overlay)/.test(view.getComputedStyle(parent).overflowY)) return parent;
  }
  return view;
}

export function collectionScrollTop(target: HTMLElement | Window): number {
  return "scrollY" in target ? target.scrollY : target.scrollTop;
}

export function collectionCameraKey(root: HTMLElement | null, id: string, breakpoint = 600): string {
  const width = root?.clientWidth || root?.ownerDocument.defaultView?.innerWidth || window.innerWidth;
  return `${id}:${width < breakpoint ? "mobile" : "desktop"}`;
}
