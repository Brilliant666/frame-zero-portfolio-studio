// Nested preview/lightbox dialogs may unmount in either order. Restore the
// original overflow only when the last owner releases its lock.
const locks = new WeakMap<HTMLElement, { count: number; original: string }>();
export function lockGalleryBodyScroll(body: HTMLElement): () => void {
  const lock = locks.get(body) ?? { count: 0, original: body.style.overflow };
  lock.count++; locks.set(body, lock); body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true; lock.count--;
    if (!lock.count) { body.style.overflow = lock.original; locks.delete(body); }
  };
}
