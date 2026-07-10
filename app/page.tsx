"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isTemplateId, normalizeSiteContent, siteConfig, type SiteContent, type TemplateId, type Work } from "./site-config";
import Lightbox from "./templates/shared/lightbox";
import TemplateRenderer from "./templates/template-renderer";

export default function Home() {
  const [content, setContent] = useState<SiteContent>(siteConfig);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateId | null>(null);
  const [activeWork, setActiveWork] = useState<Work | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isLightboxOpen = activeWork !== null;
  const works = useMemo(() => content.works.filter((work) => work.enabled), [content.works]);
  const packages = useMemo(() => content.packages.filter((item) => item.enabled), [content.packages]);
  const bookingTemplate = useMemo(
    () => ["【约拍任务申请】", ...content.bookingFields].join("\n"),
    [content.bookingFields],
  );

  useEffect(() => {
    const candidate = new URLSearchParams(window.location.search).get("template");
    const previewTimer = isTemplateId(candidate)
      ? window.setTimeout(() => setPreviewTemplate(candidate), 0)
      : undefined;
    const controller = new AbortController();

    fetch("/api/site-content", { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((result: { content?: unknown } | null) => {
        if (!result?.content) return;
        setContent(normalizeSiteContent(result.content));
        setActiveWork(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });

    return () => {
      if (previewTimer !== undefined) window.clearTimeout(previewTimer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let skipBoot = window.matchMedia("(max-width: 560px)").matches;

    try {
      skipBoot ||= window.sessionStorage.getItem("framezero-booted") === "1";
    } catch {
      // Session storage can be unavailable in private browsing contexts.
    }

    if (skipBoot) {
      const skipTimer = window.setTimeout(() => setBooted(true), 0);
      return () => window.clearTimeout(skipTimer);
    }

    const timer = window.setTimeout(() => {
      setBooted(true);
      try {
        window.sessionStorage.setItem("framezero-booted", "1");
      } catch {
        // The visual intro still completes when storage is unavailable.
      }
    }, 360);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isLightboxOpen) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const moveWork = (direction: -1 | 1) => {
      setActiveWork((current) => {
        if (!current || works.length === 0) return current;
        const index = works.findIndex((work) => work.code === current.code);
        return works[(index + direction + works.length) % works.length];
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveWork(null);
      if (event.key === "ArrowLeft") moveWork(-1);
      if (event.key === "ArrowRight") moveWork(1);

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
  }, [isLightboxOpen, works]);

  const copyText = async (value: string, key: string) => {
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
    window.setTimeout(() => setCopiedKey(null), 2200);
  };

  const moveActiveWork = (direction: -1 | 1) => {
    setActiveWork((current) => {
      if (!current || works.length === 0) return current;
      const index = works.findIndex((work) => work.code === current.code);
      return works[(index + direction + works.length) % works.length];
    });
  };

  const templateId = previewTemplate ?? content.activeTemplate;

  return (
    <>
      {previewTemplate && (
        <div className="template-preview-ribbon" role="status">
          <span>模板预览模式 · 不会修改主页设置</span>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">退出预览 ×</a>
        </div>
      )}
      <TemplateRenderer
        key={templateId}
        templateId={templateId}
        content={content}
        works={works}
        packages={packages}
        bookingTemplate={bookingTemplate}
        booted={booted}
        copiedKey={copiedKey}
        isPreview={previewTemplate !== null}
        onCopy={copyText}
        onOpenWork={(work) => setActiveWork(work)}
      />
      {activeWork && (
        <Lightbox
          work={activeWork}
          works={works}
          frameRef={lightboxRef}
          closeButtonRef={closeButtonRef}
          onMove={moveActiveWork}
          onClose={() => setActiveWork(null)}
        />
      )}
    </>
  );
}
