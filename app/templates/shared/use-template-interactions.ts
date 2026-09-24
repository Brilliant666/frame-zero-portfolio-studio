"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Work } from "../../site-config";

export function useTemplateInteractions(works: readonly Work[]) {
  const [activeWork, setActiveWork] = useState<Work | null>(null);
  const [workScope, setWorkScope] = useState<readonly Work[] | null>(null);
  const lightboxWorks = workScope ?? works;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const moveActiveWork = useCallback((direction: -1 | 1) => {
    setActiveWork((current) => {
      if (!current || lightboxWorks.length === 0) return current;
      const index = lightboxWorks.findIndex((work) => work.assetId === current.assetId && work.code === current.code);
      return lightboxWorks[(index + direction + lightboxWorks.length) % lightboxWorks.length];
    });
  }, [lightboxWorks]);

  const openWork = useCallback((work: Work, scope?: readonly Work[]) => {
    setWorkScope(scope ?? null);
    setActiveWork(work);
  }, []);

  useEffect(() => {
    if (!activeWork || !workScope) return;
    if (workScope.some((work) => work.assetId === activeWork.assetId && work.code === activeWork.code)) return;
    const frame = window.requestAnimationFrame(() => setActiveWork(null));
    return () => window.cancelAnimationFrame(frame);
  }, [activeWork, workScope]);

  useEffect(() => {
    if (!activeWork) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setActiveWork(null);
      }
      if (event.key === "ArrowLeft") moveActiveWork(-1);
      if (event.key === "ArrowRight") moveActiveWork(1);

      if (event.key === "Tab" && lightboxRef.current) {
        const focusable = Array.from(
          lightboxRef.current.querySelectorAll<HTMLElement>("button, [href], [tabindex]:not([tabindex='-1'])"),
        ).filter((element) => !element.hasAttribute("disabled"));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.body.classList.add("is-locked");
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.classList.remove("is-locked");
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [activeWork, moveActiveWork]);

  const copyText = useCallback(async (value: string, key: string) => {
    let didCopy = false;
    try {
      await navigator.clipboard.writeText(value);
      didCopy = true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      didCopy = document.execCommand("copy");
      textarea.remove();
    }
    if (!didCopy) return;
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 2_200);
  }, []);

  return {
    activeWork,
    closeButtonRef,
    copiedKey,
    copyText,
    lightboxRef,
    lightboxWorks,
    moveActiveWork,
    openWork,
    setActiveWork,
  } as const;
}
