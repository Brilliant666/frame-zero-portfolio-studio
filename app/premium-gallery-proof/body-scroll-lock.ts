// Nested preview/lightbox dialogs may unmount in either order. Restore the
// original layout only when the last owner releases its lock.
type OverflowSnapshot = { overflow: string; overflowX: string; overflowY: string };
const locks = new WeakMap<HTMLElement, OverflowSnapshot & { count: number; paddingRight: string; root?: { element: HTMLElement; style: OverflowSnapshot } }>();
export function lockGalleryBodyScroll(body: HTMLElement): () => void {
  let lock = locks.get(body);
  if (!lock) {
    lock = { count: 0, overflow: body.style.overflow, overflowX: body.style.overflowX, overflowY: body.style.overflowY, paddingRight: body.style.paddingRight };
    const viewport = body.ownerDocument?.defaultView;
    const documentElement = body.ownerDocument?.documentElement;
    // html owns the viewport scrollbar when its overflow-x is clip. Lock both
    // owners so the page behind a dialog cannot scroll or retain a second bar.
    if (documentElement?.style) {
      lock.root = { element: documentElement, style: { overflow: documentElement.style.overflow, overflowX: documentElement.style.overflowX, overflowY: documentElement.style.overflowY } };
    }
    const computed = viewport?.getComputedStyle(body);
    const borderWidth = (Number.parseFloat(computed?.borderLeftWidth ?? "0") || 0) + (Number.parseFloat(computed?.borderRightWidth ?? "0") || 0);
    const viewportScrollbar = viewport && documentElement ? Math.max(0, viewport.innerWidth - documentElement.clientWidth) : 0;
    // With overflow-x:hidden the body can own the scrollbar instead of html.
    const bodyScrollbar = Math.max(0, body.offsetWidth - body.clientWidth - borderWidth) || 0;
    const scrollbarWidth = Math.max(viewportScrollbar, bodyScrollbar);
    if (scrollbarWidth) body.style.paddingRight = `${(Number.parseFloat(computed?.paddingRight ?? "0") || 0) + scrollbarWidth}px`;
    if (lock.root) lock.root.element.style.overflow = "hidden";
    locks.set(body, lock);
  }
  lock.count++; body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true; lock.count--;
    if (!lock.count) {
      body.style.overflow = lock.overflow;
      body.style.overflowX = lock.overflowX;
      body.style.overflowY = lock.overflowY;
      body.style.paddingRight = lock.paddingRight;
      if (lock.root) {
        lock.root.element.style.overflow = lock.root.style.overflow;
        lock.root.element.style.overflowX = lock.root.style.overflowX;
        lock.root.element.style.overflowY = lock.root.style.overflowY;
      }
      locks.delete(body);
    }
  };
}
