"use client";

import { useLayoutEffect, useRef } from "react";

/** Page navigation starts at the new results, below the owning sticky header. */
export function focusPhotoResults(results: HTMLElement) {
  const dialog = results.closest("dialog");
  const scope = dialog ?? results.closest("[data-photo-workspace]");
  const header = scope?.querySelector<HTMLElement>("[data-photo-scroll-header]");
  const inset = (header?.getBoundingClientRect().height ?? 0) + 12;
  results.focus({ preventScroll: true });
  const top = results.getBoundingClientRect().top;
  if (dialog) {
    dialog.scrollTo({ top: dialog.scrollTop + top - dialog.getBoundingClientRect().top - dialog.clientTop - inset, behavior: "instant" });
  } else {
    window.scrollTo({ top: window.scrollY + top - inset, behavior: "instant" });
  }
}

export function usePhotoPageFocus(page: number) {
  const resultsRef = useRef<HTMLDivElement>(null);
  const requested = useRef(false);
  useLayoutEffect(() => {
    if (!requested.current) return;
    requested.current = false;
    if (resultsRef.current) focusPhotoResults(resultsRef.current);
  }, [page]);
  return { resultsRef, requestPageFocus: () => { requested.current = true; } };
}
