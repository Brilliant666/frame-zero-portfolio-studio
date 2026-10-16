/** Wait for the editor action dock to leave its modal/inert state before focus. */
export function restorePreviewFocus(target: HTMLElement | null): () => void {
  if (!target) return () => {};
  const page = target.ownerDocument;
  const view = page.defaultView;
  if (!view) return () => {};
  let cancelled = false, frame = 0, remaining = 12;
  const restore = () => {
    if (cancelled || !target.isConnected) return;
    // A newly opened modal or the user's next focus choice takes precedence.
    if ([...page.querySelectorAll<HTMLElement>('[aria-modal="true"], dialog[open]')].some(element => element.getClientRects().length > 0)) return;
    if (page.activeElement && page.activeElement !== page.body && page.activeElement !== target && page.activeElement.isConnected) return;
    const available = !target.closest("[inert]") && !target.matches(":disabled") && target.getClientRects().length > 0 && view.getComputedStyle(target).visibility !== "hidden";
    if (available) target.focus({ preventScroll: true });
    if (page.activeElement !== target && --remaining > 0) frame = view.requestAnimationFrame(restore);
  };
  frame = view.requestAnimationFrame(restore);
  return () => { cancelled = true; view.cancelAnimationFrame(frame); };
}
