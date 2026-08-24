"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

export type TemplatePrimaryView = "works" | "packages" | "contact";

export type TemplateViewHashes = Readonly<Record<TemplatePrimaryView, `#${string}`>>;

export type TemplateViewAlias = Readonly<{
  hash: `#${string}`;
  view: TemplatePrimaryView;
}>;

const EMPTY_ALIASES: readonly TemplateViewAlias[] = [];

function normalizeHash(hash: string) {
  const trimmed = hash.trim().toLowerCase();
  if (!trimmed) return "";
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

export function getKnownTemplateViewFromHash(
  hash: string,
  hashes: TemplateViewHashes,
  aliases: readonly TemplateViewAlias[] = [],
): TemplatePrimaryView | null {
  const normalized = normalizeHash(hash);
  const canonical = (Object.entries(hashes) as [TemplatePrimaryView, string][])
    .find(([, candidate]) => normalizeHash(candidate) === normalized);
  if (canonical) return canonical[0];
  return aliases.find((alias) => normalizeHash(alias.hash) === normalized)?.view ?? null;
}

export function getTemplateViewFromHash(
  hash: string,
  hashes: TemplateViewHashes,
  aliases: readonly TemplateViewAlias[] = [],
): TemplatePrimaryView {
  return getKnownTemplateViewFromHash(hash, hashes, aliases) ?? "works";
}

export function useTemplateSectionNavigation({
  aliases = EMPTY_ALIASES,
  hashes,
  isPreview,
  onBeforeViewChange,
}: Readonly<{
  aliases?: readonly TemplateViewAlias[];
  hashes: TemplateViewHashes;
  isPreview: boolean;
  onBeforeViewChange?: () => void;
}>) {
  const [activeView, setActiveView] = useState<TemplatePrimaryView>("works");
  const navigationFrameRef = useRef<number | null>(null);

  const scrollToHash = useCallback((hash: string, focusTarget: boolean) => {
    if (navigationFrameRef.current !== null) {
      window.cancelAnimationFrame(navigationFrameRef.current);
    }

    navigationFrameRef.current = window.requestAnimationFrame(() => {
      navigationFrameRef.current = null;
      const target = document.getElementById(normalizeHash(hash).slice(1));
      if (!target) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      if (focusTarget) target.focus({ preventScroll: true });
    });
  }, []);

  const activateHash = useCallback((hash: string, focusTarget: boolean) => {
    const normalized = normalizeHash(hash);
    const view = getKnownTemplateViewFromHash(normalized, hashes, aliases)
      ?? (normalized && document.getElementById(normalized.slice(1))?.closest('[data-template-view="works"]')
        ? "works"
        : null);
    if (!view) return false;
    onBeforeViewChange?.();
    setActiveView(view);
    if (!isPreview && window.location.hash !== normalized) {
      window.history.pushState(null, "", normalized);
    }
    scrollToHash(normalized, focusTarget);
    return true;
  }, [aliases, hashes, isPreview, onBeforeViewChange, scrollToHash]);

  const handleInternalLinkClick = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest<HTMLAnchorElement>('a[href^="#"]');
    const hash = anchor?.getAttribute("href");
    if (!hash) return;
    const knownView = getKnownTemplateViewFromHash(hash, hashes, aliases);
    const normalized = normalizeHash(hash);
    const secondaryWorksTarget = normalized
      ? document.getElementById(normalized.slice(1))?.closest('[data-template-view="works"]')
      : null;
    if (!knownView && !secondaryWorksTarget) return;
    event.preventDefault();
    activateHash(hash, true);
  }, [activateHash, aliases, hashes]);

  useEffect(() => {
    if (isPreview) return;

    const syncViewFromLocation = (focusTarget: boolean) => {
      const hash = window.location.hash;
      const knownView = getKnownTemplateViewFromHash(hash, hashes, aliases);
      const normalized = normalizeHash(hash);
      const secondaryWorksTarget = normalized
        ? document.getElementById(normalized.slice(1))?.closest('[data-template-view="works"]')
        : null;
      if (focusTarget) onBeforeViewChange?.();
      setActiveView(knownView ?? "works");
      if ((knownView || secondaryWorksTarget) && normalized) {
        scrollToHash(normalized, focusTarget);
      }
    };

    syncViewFromLocation(false);
    const handleHistoryNavigation = () => syncViewFromLocation(true);
    window.addEventListener("hashchange", handleHistoryNavigation);
    window.addEventListener("popstate", handleHistoryNavigation);
    return () => {
      window.removeEventListener("hashchange", handleHistoryNavigation);
      window.removeEventListener("popstate", handleHistoryNavigation);
    };
  }, [aliases, hashes, isPreview, onBeforeViewChange, scrollToHash]);

  useEffect(() => () => {
    if (navigationFrameRef.current !== null) {
      window.cancelAnimationFrame(navigationFrameRef.current);
    }
  }, []);

  return { activeView, handleInternalLinkClick } as const;
}
