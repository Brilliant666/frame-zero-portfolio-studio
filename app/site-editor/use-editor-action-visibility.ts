"use client";
import { useEffect, useState } from "react";

/** The action dock must never compete with a modal's focus trap or a phone keyboard. */
export function useEditorActionVisibility() {
  const [state, setState] = useState({ modalOpen: false, keyboardOpen: false });
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const modalOpen = Array.from(document.querySelectorAll('[aria-modal="true"], dialog[open]')).some(element => element.getClientRects().length > 0);
      const editing = document.activeElement?.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]') ?? false;
      const keyboardOpen = editing && !!viewport && window.innerHeight - viewport.height > 150;
      setState(previous => previous.modalOpen === modalOpen && previous.keyboardOpen === keyboardOpen ? previous : { modalOpen, keyboardOpen });
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "aria-modal", "hidden"] });
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    update();
    return () => { observer.disconnect(); viewport?.removeEventListener("resize", update); viewport?.removeEventListener("scroll", update); window.removeEventListener("resize", update); document.removeEventListener("focusin", update); document.removeEventListener("focusout", update); };
  }, []);
  return state;
}
